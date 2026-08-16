import { formatHardwareSupport } from './HardwareSupport.ts';

/**
 * Prints what the current machine can actually run before the integration
 * suites start. Suites gate themselves on hardware discovery and skip silently
 * when a device is missing, which is indistinguishable from having run and
 * passed unless the run says so up front.
 */
export function setup() {
  console.log(formatHardwareSupport());
}
