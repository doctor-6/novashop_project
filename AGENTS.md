# AGENTS.md --- Digital Products Store (University Project)

## Project goal

Build a polished, responsive, single-page storefront for a fictional
digital-products shop (for example, PC accessories, peripherals,
software-style digital items, and gaming gear), plus a separate admin
area that manages the products shown on the storefront.

This is a small university project. Prefer a straightforward
implementation that is easy to run, explain, and demonstrate. Do not
over-engineer it.

## Required stack and architecture

-   Use **HTML, CSS, and vanilla JavaScript** for the frontend.
-   Add a small backend only where needed to make admin login, product
    management, and local image uploads work reliably.
-   Recommended simple stack: **Node.js + Express** backend with a
    lightweight local JSON database or SQLite. Choose the simplest
    maintainable option and explain the choice in the README.
-   Keep storefront and admin connected to the same product data source.
    Changes made in the admin panel must appear on the storefront after
    refresh, without editing frontend source files.
-   Use clear separation of concerns:
    -   `public/` for storefront assets and frontend files
    -   `public/admin/` or an equivalent route for the admin UI
    -   `server/` or a root server entry point for backend logic
    -   `uploads/` for uploaded item photos (with safe file handling)
-   Use a small number of dependencies. Do not introduce a frontend
    framework unless there is a compelling reason.

## Storefront requirements

Create a modern, attractive single-page shop with a consistent visual
identity.

-   Design direction: dark charcoal/navy background, clean light text,
    and a tasteful electric blue or violet accent. Use CSS variables so
    the theme is easy to adjust.
-   Use strong typography, generous spacing, rounded cards, subtle
    borders/shadows, and restrained hover transitions.
-   Make the page responsive on desktop, tablet, and mobile.
-   Include:
    -   A top navigation bar with shop logo/name and links that scroll
        to sections.
    -   A hero section with a clear headline, short supporting copy, and
        a call-to-action that scrolls to products.
    -   A product area with responsive product cards.
    -   Product photo, name, short description, category (if present),
        and formatted price on each card.
    -   A simple search field and category filter if practical.
    -   A small about/benefits section and a footer.
-   Include a polished empty state when no products match the
    search/filter or when no products exist yet.
-   Use accessible semantic HTML, visible focus states, useful image alt
    text, and adequate color contrast.
-   Do not make fake checkout/payment claims. A cart or checkout is
    optional; if included, clearly label it as a demo and do not collect
    real payment details.

## Admin panel requirements

Create a separate admin page with a login screen and a simple dashboard.

### Login

-   The requested demo password is `1234`.
-   For this university demo, use a clearly documented demo login. Do
    not present this hardcoded password as production-secure
    authentication.
-   Prefer checking credentials on the server and using a session or
    another basic server-managed login state. Do not rely only on hiding
    admin UI in client-side JavaScript.
-   The login screen should have clear validation and friendly error
    messages.
-   Provide a logout action.
-   Do not print the password to logs or expose it in unrelated UI.

### Product management

The admin must be able to:

-   View all products in a readable table or card list.
-   Add a product.
-   Edit an existing product, including changing its price.
-   Delete a product, with a confirmation step.
-   Upload a product image from the user's local computer using a file
    input.
-   Preview the selected image before saving.
-   Enter at least a product name, price, description, and optional
    category.
-   See helpful validation errors for missing or invalid values.
-   See a success/error message after each action.

Changes must be persisted by the backend and displayed by the public
storefront. Use the same product API/data source for both views.

### Image upload handling

-   Support common image formats such as JPEG, PNG, and WebP.
-   Enforce a reasonable upload size limit.
-   Validate file type on the server; do not trust the filename or
    browser-provided MIME type alone.
-   Generate safe unique filenames rather than using raw user-supplied
    filenames.
-   Store uploaded files in the designated uploads directory and save
    only the relative image path/URL in product data.
-   Prevent path traversal and do not allow arbitrary file uploads or
    execution.
-   Show a fallback image or visual placeholder if an image is missing.

## Data and API behavior

Implement a small, consistent product data model. Suggested fields:

-   `id`: stable unique identifier
-   `name`: required string
-   `description`: required or optional short string
-   `price`: non-negative number
-   `category`: optional string
-   `image`: optional relative URL/path
-   `createdAt` and/or `updatedAt`: optional timestamps

Suggested API endpoints (names may be adjusted if the chosen
architecture requires it):

-   `GET /api/products` --- list products for the storefront and admin.
-   `GET /api/products/:id` --- retrieve one product if useful.
-   `POST /api/products` --- create a product; admin authentication
    required.
-   `PUT /api/products/:id` --- update a product; admin authentication
    required.
-   `DELETE /api/products/:id` --- delete a product; admin
    authentication required.
-   `POST /api/admin/login` --- validate demo credentials and establish
    a session.
-   `POST /api/admin/logout` --- end the session.
-   `GET /api/admin/session` --- check whether the admin is logged in.
-   Use multipart form data for product image uploads, either as part of
    create/update or via a dedicated authenticated endpoint.

Protect all write operations on the server. Validate and normalize
incoming data on the server even if the browser also validates it.
Return appropriate HTTP status codes and readable JSON errors.

## Security and project scope

This is a classroom demo, not a production commerce platform.

-   Never store user passwords or secrets in source control beyond the
    explicitly requested demo credential; if feasible, make the demo
    password configurable with an environment variable and use `1234` as
    the documented local default.
-   If sessions are used, configure cookies sensibly for local
    development and avoid exposing session secrets in client code.
-   Use safe DOM rendering (`textContent` or equivalent) for
    product-provided text; do not inject untrusted strings into
    `innerHTML`.
-   Validate all product fields on the server.
-   Do not implement real payments, customer account systems, or
    external services unless explicitly requested.
-   Include a `.gitignore` for `node_modules/`, environment files, local
    database/data files as appropriate, and uploaded files if they
    should remain local.
-   Keep error messages useful without exposing stack traces or
    sensitive server details to the browser.

## Code quality

-   Write readable code with descriptive names and small functions.
-   Keep HTML, CSS, and JavaScript separated where practical.
-   Avoid unnecessary abstractions, duplicate code, and oversized
    dependencies.
-   Add comments for non-obvious decisions, not for every line.
-   Keep styles consistent and use CSS custom properties for colors,
    spacing, and reusable design values.
-   Handle loading, empty, validation, success, and error states.
-   Ensure navigation, filters, forms, modal/dialog controls, and logout
    actually work.
-   Do not leave core functionality as TODOs or fake buttons.

## Setup and documentation

Create a `README.md` that includes:

-   Prerequisites (for example, Node.js version).
-   Installation command(s).
-   How to start the app locally.
-   The local URL for the storefront and the admin page.
-   Demo admin password: `1234` (and a clear warning that it is only for
    classroom demonstration).
-   Where product data and uploaded images are stored.
-   How to reset the demo data if applicable.
-   Known limitations.

Provide a useful `.env.example` if environment variables are used. Do
not commit real secrets.

## Verification checklist

Before considering the project complete:

1.  Install dependencies and start the app using the documented
    commands.
2.  Confirm the storefront loads with no console errors.
3.  Confirm the admin login accepts the documented demo password and
    rejects an incorrect password.
4.  Confirm logged-out users cannot create, edit, or delete products by
    calling the API directly.
5.  Add a product from the admin panel and confirm it appears on the
    storefront.
6.  Edit its name and price and confirm the storefront updates.
7.  Upload a local image and confirm it displays on the product card
    after saving and refreshing.
8.  Delete a product and confirm it disappears from both views.
9.  Test invalid price, missing required fields, and
    unsupported/oversized image uploads.
10. Test mobile and desktop layouts.
11. Ensure the README setup steps work from a clean checkout.

## Instructions for the coding agent

-   First inspect the existing repository and preserve any useful
    working code.
-   If the repository is empty, create the project structure described
    above.
-   Implement the complete working application, not just a visual
    mockup.
-   Make reasonable decisions without asking about minor details. Keep
    the result small and beginner-friendly.
-   After implementation, run available checks or tests and fix errors.
-   At the end, summarize the architecture, files created, setup
    commands, local URLs, and any limitations.
-   If a requested feature cannot be completed in the current
    environment, explain exactly what remains instead of claiming it
    works.
