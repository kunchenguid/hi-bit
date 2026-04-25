export const MIN_PIN_LENGTH = 4;

export type PinValidation = { ok: true } | { ok: false; error: string };

export function validatePinSetup(pin: string, confirm: string): PinValidation {
  if (pin.length < MIN_PIN_LENGTH) {
    return { ok: false, error: `PIN must be at least ${MIN_PIN_LENGTH} characters.` };
  }
  if (pin !== confirm) {
    return { ok: false, error: "PINs don't match. Try retyping." };
  }
  return { ok: true };
}

export function validatePinEntry(pin: string): PinValidation {
  if (pin.length === 0) {
    return { ok: false, error: "Enter your PIN." };
  }
  return { ok: true };
}

export function validatePinChange(
  currentPin: string,
  newPin: string,
  confirmNewPin: string,
): PinValidation {
  if (currentPin.length === 0) {
    return { ok: false, error: "Enter your current PIN." };
  }
  if (newPin.length < MIN_PIN_LENGTH) {
    return {
      ok: false,
      error: `New PIN must be at least ${MIN_PIN_LENGTH} characters.`,
    };
  }
  if (newPin === currentPin) {
    return { ok: false, error: "New PIN must be different from the current PIN." };
  }
  if (newPin !== confirmNewPin) {
    return { ok: false, error: "New PINs don't match. Try retyping." };
  }
  return { ok: true };
}
