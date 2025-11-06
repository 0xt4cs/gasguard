class RateLimiter {
  constructor() {
    // Track attempts
    this.attempts = new Map();
    
    // Configuration
    this.MAX_ATTEMPTS = 5;
    this.BASE_LOCKOUT_MS = 60 * 1000;
    
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
    
    console.log('[RATE LIMITER] Initialized - Max attempts:', this.MAX_ATTEMPTS, '| Base lockout: 1 minute');
  }

  // Get unique identifier for tracking
  getIdentifier(ip, username) {
    return `${ip}:${username || 'unknown'}`;
  }

  // Calculate lockout duration with exponential backoff
  calculateLockoutDuration(consecutiveLockouts) {
    return this.BASE_LOCKOUT_MS * Math.pow(2, consecutiveLockouts);
  }

  // Check if request is allowed
  checkAttempt(ip, username = null) {
    const identifier = this.getIdentifier(ip, username);
    const now = Date.now();
    
    // Get or create attempt record
    let record = this.attempts.get(identifier);
    
    if (!record) {
      record = {
        attempts: 0,
        lockoutUntil: 0,
        consecutiveLockouts: 0,
        lastAttempt: now
      };
      this.attempts.set(identifier, record);
    }

    // Check if currently locked out
    if (record.lockoutUntil > now) {
      const remainingSeconds = Math.ceil((record.lockoutUntil - now) / 1000);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      
      console.log(`[RATE LIMITER] Blocked attempt from ${ip} (${username || 'unknown'}) - ${remainingMinutes}m remaining`);
      
      return {
        allowed: false,
        message: `Too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
        retryAfter: remainingSeconds
      };
    }

    // Check if lockout has expired - reset if needed
    if (record.lockoutUntil > 0 && record.lockoutUntil <= now) {
      console.log(`[RATE LIMITER] Lockout expired for ${ip} (${username || 'unknown'}) - resetting attempts`);
      record.attempts = 0;
      record.lockoutUntil = 0;
      // Keep consecutiveLockouts for exponential backoff
    }

    return {
      allowed: true,
      message: 'Attempt allowed',
      attemptsRemaining: this.MAX_ATTEMPTS - record.attempts
    };
  }

  // Record failed login attempt
  recordFailedAttempt(ip, username = null) {
    const identifier = this.getIdentifier(ip, username);
    const now = Date.now();
    
    let record = this.attempts.get(identifier);
    
    if (!record) {
      record = {
        attempts: 0,
        lockoutUntil: 0,
        consecutiveLockouts: 0,
        lastAttempt: now
      };
      this.attempts.set(identifier, record);
    }

    record.attempts++;
    record.lastAttempt = now;

    console.log(`[RATE LIMITER] Failed attempt #${record.attempts} from ${ip} (${username || 'unknown'})`);

    // Trigger lockout if max attempts reached
    if (record.attempts >= this.MAX_ATTEMPTS) {
      record.consecutiveLockouts++;
      const lockoutDuration = this.calculateLockoutDuration(record.consecutiveLockouts - 1);
      record.lockoutUntil = now + lockoutDuration;
      
      const lockoutMinutes = Math.ceil(lockoutDuration / (60 * 1000));
      
      console.log(`[RATE LIMITER] 🚨 LOCKOUT #${record.consecutiveLockouts} triggered for ${ip} (${username || 'unknown'}) - ${lockoutMinutes} minute(s)`);
      
      return {
        locked: true,
        duration: lockoutDuration,
        durationMinutes: lockoutMinutes,
        consecutiveLockouts: record.consecutiveLockouts
      };
    }

    return {
      locked: false,
      attemptsRemaining: this.MAX_ATTEMPTS - record.attempts
    };
  }

  // Record successful login
  recordSuccess(ip, username = null) {
    const identifier = this.getIdentifier(ip, username);
    
    if (this.attempts.has(identifier)) {
      console.log(`[RATE LIMITER] ✓ Successful login from ${ip} (${username || 'unknown'}) - resetting all counters`);
      this.attempts.delete(identifier);
    }
  }

  // Cleanup old entries
  cleanup() {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    let cleaned = 0;

    for (const [identifier, record] of this.attempts.entries()) {
      // Remove if last attempt was over 1 hour ago and not locked
      if (record.lockoutUntil <= now && (now - record.lastAttempt) > ONE_HOUR) {
        this.attempts.delete(identifier);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RATE LIMITER] Cleanup: Removed ${cleaned} old entries`);
    }
  }

  // Get statistics for monitoring
  getStats() {
    const now = Date.now();
    let lockedCount = 0;
    let attemptingCount = 0;

    for (const record of this.attempts.values()) {
      if (record.lockoutUntil > now) {
        lockedCount++;
      } else if (record.attempts > 0) {
        attemptingCount++;
      }
    }

    return {
      totalTracked: this.attempts.size,
      currentlyLocked: lockedCount,
      withFailedAttempts: attemptingCount
    };
  }
}

const rateLimiter = new RateLimiter();

function loginRateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const username = req.body.username || null;

  // Check if allowed
  const check = rateLimiter.checkAttempt(ip, username);

  if (!check.allowed) {
    return res.status(429).json({
      error: check.message,
      retryAfter: check.retryAfter
    });
  }

  // Attach rate limiter to request for use in auth route
  req.rateLimiter = rateLimiter;
  req.rateLimiterIp = ip;

  next();
}

module.exports = {
  rateLimiter,
  loginRateLimitMiddleware
};

