import gpiod
from gpiod.line import Direction, Value
import time
import sys

CHIP = "/dev/gpiochip0"

GREEN_LED = 17
YELLOW_LED = 27
RED_LED = 22
BUZZER = 18

def set_gpio(pin, value):
    try:
        gpio_value = Value.ACTIVE if value == 1 else Value.INACTIVE
        
        request = gpiod.request_lines(
            CHIP,
            consumer="gasguard-test",
            config={
                pin: gpiod.LineSettings(
                    direction=Direction.OUTPUT,
                    output_value=gpio_value
                )
            }
        )
        
        return request
    except Exception as e:
        print(f"[ERROR] Error setting GPIO {pin}: {e}")
        return None

def test_led(pin, name, color_emoji):
    print(f"Testing {name} (GPIO {pin})...")
    
    request = set_gpio(pin, 1)
    if request:
        print(f"{color_emoji} {name} ON")
        time.sleep(1)
        
        request.set_value(pin, Value.INACTIVE)
        print(f" {name} OFF")
        request.release()
        time.sleep(0.5)
    else:
        print(f"[ERROR] Failed to control {name}")

def test_buzzer():
    print(f"Testing Buzzer (GPIO {BUZZER})...")
    
    request = set_gpio(BUZZER, 1)
    if request:
        print(f"[SOUND] Buzzer ON")
        time.sleep(1)
        
        request.set_value(BUZZER, Value.INACTIVE)
        print(f"[MUTE] Buzzer OFF")
        request.release()
        time.sleep(0.5)
    else:
        print(f"[ERROR] Failed to control Buzzer")

def test_all_leds():
    print("Testing all LEDs simultaneously...")
    
    try:
        request = gpiod.request_lines(
            CHIP,
            consumer="gasguard-test",
            config={
                GREEN_LED: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.ACTIVE),
                YELLOW_LED: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.ACTIVE),
                RED_LED: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.ACTIVE)
            }
        )
        
        print("[GREEN] [YELLOW] [RED] All LEDs ON")
        time.sleep(2)
        
        request.set_value(GREEN_LED, Value.INACTIVE)
        request.set_value(YELLOW_LED, Value.INACTIVE)
        request.set_value(RED_LED, Value.INACTIVE)
        print(" All LEDs OFF")
        
        request.release()
        
    except Exception as e:
        print(f"[ERROR] Error controlling all LEDs: {e}")

def main():
    print("=" * 50)
    print("GasGuard Hardware Test (Python gpiod v2)")
    print("=" * 50)
    print()
    
    try:
        print(f"[OK] Using {CHIP}")
        print()
        
        test_led(GREEN_LED, "Green LED", "[GREEN]")
        print()
        
        test_led(YELLOW_LED, "Yellow LED", "[YELLOW]")
        print()
        
        test_led(RED_LED, "Red LED", "[RED]")
        print()
        
        test_buzzer()
        print()
        
        test_all_leds()
        print()
        
        print("=" * 50)
        print("Hardware test complete!")
        print("=" * 50)
        print()
        print("Next steps:")
        print("1. If all LEDs/buzzer worked: Hardware is good! [OK]")
        print("2. Start your server: npm start")
        print("3. Access dashboard: http://iotgasleakdetect.local:3000")
        
        return 0
        
    except PermissionError:
        print("[ERROR] Permission denied! Run with: sudo python3 test-hardware.py")
        return 1
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
