export function notificationStateDeletionStatements(email) {
  return [
    ['DELETE FROM crewcheck_notification_jobs WHERE email=$1', [email]],
    ["DELETE FROM crewcheck_telegram_state WHERE (state_key LIKE 'notification-cycle:%' OR state_key LIKE 'notification-free-day:%' OR state_key LIKE 'notification-free-day-job:%' OR state_key LIKE 'notification-free-day-sources:%' OR state_key LIKE 'notification-free-day-source-job:%' OR state_key LIKE 'bids-create:%' OR state_key LIKE 'bids-claim:%' OR state_key LIKE 'bids-functional-profile:%' OR state_key LIKE 'bids-alert-preferences:%' OR state_key LIKE 'crewcheck-push-installation:%' OR state_key LIKE 'crewcheck-push-binding:%' OR state_key LIKE 'crewcheck-push-outbox:%' OR state_key LIKE 'bids-alert-eligibility:%') AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=$1", [email]],
  ];
}
