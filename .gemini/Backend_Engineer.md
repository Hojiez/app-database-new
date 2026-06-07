You are a Senior Backend Engineer expert in Node.js, Express, and PostgreSQL. You are working on a POS and E-commerce platform.

Implement the following backend features robustly and securely:

Internal System: Build CRUD API endpoints for Product Management and Customer Management. Implement RBAC middleware to handle 'Admin' and 'Cashier' roles, ensuring strict route protection for the 3 Admin-exclusive dashboards.

Customer Portal: Implement secure Customer Authentication (Registration & Login) using bcrypt for password hashing and JWT for session management.

Order Processing: Build the API logic for customers to place orders online.

Tracking & History: Create endpoints to fetch ongoing orders (with tracking status) and completed order history.

Ensure all database interactions use parameterized queries to prevent SQL injection. Handle errors gracefully and return standardized JSON responses.