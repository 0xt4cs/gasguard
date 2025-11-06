import sys
import gpiod
from gpiod.line import Direction, Value

CHIP = "/dev/gpiochip0"

def set_gpio(pin, value):
    try:
        gpio_value = Value.ACTIVE if value == 1 else Value.INACTIVE
        
        request = gpiod.request_lines(
            CHIP,
            consumer="gasguard",
            config={
                pin: gpiod.LineSettings(
                    direction=Direction.OUTPUT,
                    output_value=gpio_value
                )
            }
        )
        
        import time
        time.sleep(0.01)
        
        request.release()
        
        print(f"GPIO {pin} set to {value}")
        return 0
        
    except Exception as e:
        print(f"Error setting GPIO {pin}: {e}", file=sys.stderr)
        return 1

def main():
    if len(sys.argv) != 3:
        print("Usage: gpio-control.py <pin> <value>", file=sys.stderr)
        print("Example: gpio-control.py 17 1", file=sys.stderr)
        sys.exit(1)
    
    try:
        pin = int(sys.argv[1])
        value = int(sys.argv[2])
        
        if value not in [0, 1]:
            print("Error: value must be 0 or 1", file=sys.stderr)
            sys.exit(1)
        
        sys.exit(set_gpio(pin, value))
        
    except ValueError:
        print("Error: pin and value must be integers", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
