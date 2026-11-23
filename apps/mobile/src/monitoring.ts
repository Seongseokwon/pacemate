import * as Sentry from '@sentry/react-native';

export function initMonitoring(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, enableNative: false, sendDefaultPii: false, beforeSend: scrubEvent });
}

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    type: undefined, event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    level: event.level, release: event.release, environment: event.environment, debug_meta: event.debug_meta,
    exception: event.exception && { values: event.exception.values?.map((value) => ({
      type: ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'PrismaClientKnownRequestError'].includes(value.type ?? '') ? value.type : 'Error', stacktrace: value.stacktrace && { frames: value.stacktrace.frames?.map(({ filename, function: name, lineno, colno, in_app }) => ({ filename, function: name, lineno, colno, in_app })) },
    })) },
  };
}
