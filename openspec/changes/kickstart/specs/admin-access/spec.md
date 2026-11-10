## Purpose

Let the single admin log in to and out of the admin tool, and refuse every admin page, admin API call and order photo or drawing to anyone who is not logged in.

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

### Requirement: Admin tool requires login
Every admin page and admin API call, including the photos and drawings of orders, SHALL require a logged-in admin. Without a valid admin session pages MUST redirect to the login page and API calls MUST be refused as unauthenticated (401) without returning any data (BR-011, BR-010).

#### Scenario: AC-026 Admin pages and API calls are refused without login
- **GIVEN** no one is logged in
- **WHEN** someone opens the admin order list page, and separately calls the admin API to list orders and to adjust the stock of a frame
- **THEN** the page redirects to the admin login page
- **AND** both API calls are refused as unauthenticated (401), return no order or frame data and change nothing

#### Scenario: AC-027 Order photo and drawing are refused without login
- **GIVEN** order FL-2026-0042 has a photo and a drawing
- **WHEN** someone who is not logged in requests the photo or downloads the SVG of FL-2026-0042
- **THEN** both requests are refused as unauthenticated (401) and no file content is returned
- **AND** the status of FL-2026-0042 does not change

### Requirement: Admin logout
The admin SHALL be able to log out; after logging out, the session MUST no longer give access to any admin page or API call (BR-011).

#### Scenario: AC-028 Logged-out session is refused
- **GIVEN** the admin is logged in
- **WHEN** the admin logs out and then calls the admin API to list orders with the same session
- **THEN** the call is refused as unauthenticated (401)
