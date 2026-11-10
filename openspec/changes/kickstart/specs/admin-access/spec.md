## Purpose

Let the single admin log in to and out of the admin tool, refuse every admin page, admin API call and order photo or drawing to anyone who is not logged in, and protect the admin session against guessing, theft, forged requests and framing.

## ADDED Requirements

### Requirement: Admin login
The system SHALL log the admin in only with the username and password of the single admin account set in the deployment configuration. Wrong credentials MUST be refused with one message that does not say which part was wrong. There is no sign-up and no password change in the admin tool (BR-011).

#### Scenario: AC-024 Admin logs in with the configured credentials
- **GIVEN** the deployment configures the admin username "owner" and password "pen-and-paper-2026"
- **WHEN** someone logs in with "owner" and "pen-and-paper-2026"
- **THEN** they are logged in and see the admin order list

#### Scenario: AC-025 Wrong credentials are refused
- **GIVEN** the deployment configures the admin username "owner" and password "pen-and-paper-2026"
- **WHEN** someone logs in with "owner" and "pen-and-paper-2025", or with "admin" and "pen-and-paper-2026"
- **THEN** both attempts are refused with the same message "Wrong username or password"
- **AND** no admin session is started

### Requirement: Login attempt limit
After 5 failed logins from one client address within 15 minutes, the system MUST refuse further login attempts from that address, including ones with the right password, with a suggested wait time until the 15 minutes have passed. The client address MUST NOT be taken from a header the client can set (SR-011, BR-011).

#### Scenario: AC-061 Sixth login attempt in 15 minutes is refused even with the right password
- **GIVEN** 5 logins with wrong passwords were tried from one client address between 10:00 and 10:04
- **WHEN** someone logs in from that address with "owner" and the right password "pen-and-paper-2026" at 10:05
- **THEN** the attempt is refused with "Too many login attempts. Please wait 10 minutes and try again." and a suggested wait time
- **AND** no admin session is started
- **AND** logging in with the right password from that address at 10:16 succeeds

### Requirement: Admin tool requires login
Every admin page and every admin API call, for every method, including the photos and drawings of orders, SHALL require a valid admin session; only the login call is exempt. Without one, pages MUST redirect to the login page and API calls MUST be refused as unauthenticated (401) before the request body is read, returning no data and changing nothing (BR-011, BR-010, SR-014).

#### Scenario: AC-026 Every admin call is refused without a valid session
- **GIVEN** a session cookie of a session that expired, and a made-up session cookie
- **WHEN** every admin API route except login is called with every method it supports, once without a session cookie, once with the made-up cookie and once with the expired session's cookie
- **THEN** every call is refused as unauthenticated (401) and returns no order, customer or frame data
- **AND** nothing changes and no uploaded file is stored
- **AND** opening the admin order list page without a session redirects to the admin login page

#### Scenario: AC-027 Order photo and drawing are refused without login
- **GIVEN** order FL-2026-0042 has status "received", a photo and a drawing
- **WHEN** someone who is not logged in requests the photo, views the drawing or downloads the SVG for the arm of FL-2026-0042
- **THEN** each request is refused as unauthenticated (401) and no file content is returned
- **AND** the status of FL-2026-0042 is still "received"

### Requirement: Admin session protection
A login SHALL start a new session, ending any session the browser presented. The session cookie MUST be inaccessible to page scripts, sent only over HTTPS (except an explicit localhost setting), never sent with cross-site requests, and limited to the admin API. A session MUST end after 8 hours without use and 24 hours after login, even when in use (SR-012, BR-011).

#### Scenario: AC-062 Login sets a protected cookie and a new session each time
- **WHEN** the admin logs in
- **THEN** the session cookie is set as HttpOnly, Secure and SameSite=Strict, limited to the admin API path
- **AND** when the admin logs in again in the same browser, the new session cookie differs from the previous one and the previous one is refused as unauthenticated (401)

#### Scenario: AC-063 Idle and old sessions are refused
- **GIVEN** session A was last used 8 hours and 1 minute ago, and session B was started 24 hours and 1 minute ago and used every 30 minutes since
- **WHEN** the admin API is called to list orders with session A, and with session B
- **THEN** both calls are refused as unauthenticated (401)

### Requirement: Admin changes only from the admin tool
Every admin call that changes something, including login and logout, MUST carry the admin tool's request header; without it the call MUST be refused as forbidden (403) before the request body is read, and nothing changes, even with a valid session (SR-013, BR-011).

#### Scenario: AC-064 Changes without the admin tool's header are refused
- **GIVEN** the admin is logged in with a valid session
- **WHEN** adding a frame with a photo, adjusting stock by +5, changing an order's status and logging in are each sent with the session cookie but without the admin tool's request header
- **THEN** each call is refused as forbidden (403)
- **AND** no frame is created, stock and status are unchanged, no file is stored and no new session is started

### Requirement: Pages refuse framing and third-party scripts
Every page of the shop and the admin tool SHALL be served with a content security policy that forbids showing the page inside a frame on any site and allows scripts only from our own site (SR-019, BR-016).

#### Scenario: AC-065 Shop and admin pages carry a protective content security policy
- **WHEN** the shop's home page, the admin login page and the admin order list page are requested
- **THEN** each response carries a content security policy that forbids framing by any site and allows scripts only from our own origin
- **AND** none of the pages loads a script, font or other content from another site

### Requirement: Admin logout
The admin SHALL be able to log out; after logging out, the session MUST no longer give access to any admin page or API call (BR-011).

#### Scenario: AC-028 Logged-out session is refused
- **GIVEN** the admin is logged in
- **WHEN** the admin logs out and then calls the admin API to list orders with the same session
- **THEN** the call is refused as unauthenticated (401)
