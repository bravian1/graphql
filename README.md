# GRAPHQL

This project is a web-based profile dashboard that fetches user data from the Zone01 GraphQL API and displays it, including user information, XP statistics, project grades, audit details, and interactive SVG charts.

## What is GraphQL?

GraphQL is a query language for APIs and a runtime for fulfilling those queries with your existing data. It provides a more efficient, powerful, and flexible alternative to REST. Instead of having multiple endpoints that return fixed data structures, GraphQL allows the client to specify exactly what data it needs, reducing over-fetching and under-fetching of data.

## Features

*   **User Authentication:** Secure login using username/email and password with JWT authentication.
*   **Profile Overview:** Displays basic user information (ID, Login).
*   **XP Tracking:** Shows total XP earned and a list of recent XP transactions.
*   **Project Statistics:** Provides insights into project performance, including completed audits, passed audits, and average grade.
*   **Data Visualization:** Generates interactive SVG charts to visualize XP earned by project and a skills overview.
*   **Responsive Design:** The dashboard is designed to be viewable on different screen sizes (using Tailwind CSS).

## Technologies Used

*   **Frontend:**
    *   HTML5
    *   CSS (Tailwind CSS)
    *   JavaScript
    *   SVG for charts
*   **Backend Interaction:**
    *   GraphQL for data fetching
    *   JWT for authentication

## Code Flow and Structure

The application follows a simple flow:

1.  **Login Page (`index.html`, `app.js`):**
    *   The user is presented with a login form (`index.html`).
    *   When the form is submitted, the `handleLogin` function in `app.js` is called.
    *   This function sends a POST request to the authentication endpoint (`https://learn.zone01kisumu.ke/api/auth/signin`) with the user's credentials using Basic authentication.
    *   If authentication is successful, a JWT token is received and stored in `localStorage`.
    *   The application then transitions to the profile page.

2.  **Profile Page (`index.html`, `app.js`):**
    *   The profile page (`index.html`) is initially hidden and shown after successful login.
    *   The `showProfile` function in `app.js` is called, which initiates the data loading process.
    *   The `loadProfileData` function asynchronously fetches various data points using GraphQL queries:
        *   `loadUserInfo`: Fetches basic user details (ID, login).
        *   `loadTransactions`: Fetches XP transactions and skill data.
        *   `loadProgress`: Fetches project progress data.
        *   `loadAudits`: Fetches audit details.
    *   The `makeGraphQLQuery` function handles sending GraphQL queries to the API endpoint (`https://learn.zone01kisumu.ke/api/graphql-engine/v1/graphql`) with the stored JWT for authorization.
    *   Once data is loaded, `displayUserInfo`, `calculateStats`, and `generateCharts` functions update the UI with the fetched information.
    *   `displayUserInfo` populates the user information section.
    *   `calculateStats` computes total XP, audit statistics (completed, passed, average grade), and populates the recent transactions table using `populateProjectsTable`.
    *   `generateCharts` renders the SVG charts for XP by project and skills overview using `renderXPByProjectChart` and `renderSkillsChart` respectively.
    *   The `handleLogout` function clears the JWT from `localStorage` and returns the user to the login page.

## Installation

1.  Clone this repository to your local machine.
2.  Navigate to the project directory.
3.  Open the `index.html` file in your web browser.

## Usage

1.  Open the `index.html` file in your browser.
2.  Enter your Zone01 username or email and password on the login page.
3.  Click "Sign In".
4.  If the credentials are correct, you will be redirected to your profile dashboard displaying your information and statistics.
5.  Click "Logout" to sign out of your profile.

## Project Structure

*   `index.html`: The main HTML file containing the structure of the login and profile pages.
*   `app.js`: The JavaScript file containing the logic for authentication, data fetching, UI manipulation, and chart generation.
*   `README.md`: This file, providing an overview of the project.
