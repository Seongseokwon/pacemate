import * as Sentry from '@sentry/node';

export function initMonitoring(dsn?: string): void {
  if (!dsn) return;
  Sentry.init({ dsn, beforeSend: scrubEvent });
}

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    type: undefined, event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    level: event.level, release: event.release, environment: event.environment,
    exception: event.exception && { values: event.exception.values?.map((value) => ({
      type: 'Error', stacktrace: value.stacktrace && { frames: value.stacktrace.frames?.map(({ filename, function: name, lineno, colno, in_app }) => ({ filename, function: name, lineno, colno, in_app })) },
    })) },
  };
}
