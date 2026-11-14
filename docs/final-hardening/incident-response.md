# Security incident response

Keep this procedure with the people who administer Webcenta. Record every incident (step 7).

## 1. Notice and confirm
Triggers include:
* an email from "[Webcenta Admin] Security activity" or "New sign-in to your account";
* a user report;
* something unexpected in the admin portal.

To confirm, open **admin.webcenta.com → Security → Account and request security** and check:
* recent warnings (type, source address, count, time);
* locked accounts;
* active administrator sessions (address and browser);
* configuration changes and sensitive administrator actions;
* **Audit log** (Admin → Audit), filtered by administrator, action or time.

## 2. Contain: revoke sessions
* **One administrator:** Security → Active administrator sessions → *Revoke all their sessions* (confirm with your authenticator code), or Administrators → *Suspend* (also revokes sessions).
* **All administrators at once:** admin sessions are database rows, so suspend the affected accounts or, in an emergency, run `UPDATE AdminSession SET revokedAt = NOW() WHERE revokedAt IS NULL;` in phpMyAdmin. Everyone is signed out, and Super Administrators sign in again with MFA.
* **A user account:** Admin → Users → the user → *Suspend* (their sessions stop working).
* **A developer organisation:** Admin → Developers → *Suspend* (their listings can no longer be changed).
* **A malicious listing:** Admin → Listings → *Suspend* or *Remove* (step-up required), or Security → alerts.

## 3. Disable compromised accounts
* Suspend the administrator, user or developer as above.
* For a compromised **administrator**: after investigation, a Super Administrator re-invites them or resets their MFA (Administrators page). They choose a new password and enrol a new authenticator.

## 4. Rotate credentials
Change them where they live, then redeploy (hPanel → Websites → webcenta.com → Node.js → Environment variables → Save → redeploy).

| Secret | Where | Effect of rotating |
|---|---|---|
| `USER_AUTH_SECRET` | hPanel env | signs every user out |
| `CRON_SECRET` | hPanel env (and Admin → Settings → Scheduled tasks if set there) | the cron script picks it up from the new build automatically |
| `DATABASE_URL` password | hPanel → Databases → change password, then hPanel env | — |
| SMTP password, OAuth client secrets, API keys | the provider's console, then Admin → Settings (encrypted) or hPanel env | — |
| `FIELD_ENCRYPTION_KEY` | **do not change casually**: it decrypts stored settings secrets and admin TOTP seeds; re-enter integration secrets afterwards | — |
| GitHub access | GitHub → Settings → Applications (Hostinger app) | redeploys stop until re-authorised |

## 5. Restore data
If data was altered or deleted, restore from backup ([backup-restore.md](backup-restore.md)). Restore into a new database first, compare, then switch. Never restore over production without a fresh backup of the current state.

## 6. Investigate
* **Audit log:** what each administrator did, from which address.
* **Security log:** failed sign-ins, lockouts, rate limits, denials, new devices.
* **Admin sign-in history:** `AdminLoginEvent` (success, failure reason, address, browser).
* **Hosting runtime log** (hPanel → Node.js → Logs, or the Hostinger API): application errors, `[webcenta] cron tick`, refused requests.
* **Listing history:** Admin → Listings → the listing (status changes, revisions, scans).

## 7. Record and resolve
Write down:
* when it was noticed and how;
* what was affected (accounts, listings, data);
* the actions taken, with times;
* the root cause;
* the follow-up (fix, new rule, communication).

If personal data may have been exposed, check the legal notification duties in your jurisdiction (for example, 72 hours under the GDPR) and inform affected users.
