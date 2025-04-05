# EMComponent

`EMComponent` is a utility class for dynamically loading HTML fragments (components) into a host web page. It fetches the component's HTML, processes its content, injects styles and scripts into the **global document scope**, and renders the component's body content within a specified target element.

**Core Mechanism:** Global Injection. This means styles and scripts from the component are added directly to the main document's `<head>`, and the component's body HTML is added to a regular DOM element on the host page. This approach is simple but requires careful component authoring to avoid conflicts.

## Usage Example
- check out index.html and login-page
- demo loading 2 login page components : https://skillfulelectro.github.io/EMComponent/

## Component Authoring Guidelines
- To ensure your HTML, CSS, and JavaScript work correctly when loaded via EMComponent, follow these guidelines:

### HTML 
1. Structure: Your HTML file should represent a self-contained fragment, typically including:

- `A <head> section for component-specific <link rel="stylesheet"> or <style> tags`.

- `A <body> section containing the component's visible content and any necessary <script> tags`.

2. Relative Paths: Use relative paths for all assets referenced within the component HTML (e.g., href="component.css", src="component.js", src="./images/logo.png"). EMComponent will automatically resolve these paths relative to the location of the component's HTML file.

3. Element IDs:

- IDs within the component's <body> must be unique across the entire host page after injection.

- Avoid generic IDs like container, button, form.

- Best Practice: Prefix IDs with a component-specific name (e.g., id="my-login-username", id="user-profile-picture").

4. Root Element: It's often helpful to wrap your component's body content in a single root div with a specific, unique class or ID. This aids CSS scoping and JavaScript targeting.

5. `Scripts: Include <script> tags within the <body> (usually at the end) or <head>. EMComponent collects these scripts and executes them sequentially after the component's body is injected`.

### CSS
1. Global Scope: `All CSS rules (from linked files or inline <style> tags) are injected directly into the main document's <head>. They become global styles`.

2. Specificity is Key: Your CSS selectors must be specific enough to target only the elements within your component. Failure to do so will result in your component's styles affecting other parts of the host page, or host page styles unintentionally affecting your component.

3. Avoid Broad Selectors: Do not use generic element selectors like div, p, button at the top level of your CSS. These will apply globally.

4. Use Scoping: Target elements based on a unique parent container class or ID defined in your component's HTML.

- Good: .my-login-container button { ... }, #user-profile .avatar { ... }

- Bad: button { ... }, .modal p { ... } (unless .modal is guaranteed unique)

5. Prefixing: Consider prefixing all your component's class names (e.g., .my-login-form-group, .my-login-button).

6. No html, body Styling: Avoid styling the html or body tags directly within your component's CSS, as this will override host page styles.

7. Deduplication: `EMComponent attempts to prevent injecting the same external CSS file (based on resolved URL) multiple times. Inline <style> tags are always injected`.

### JavaScript

*   **Global Execution Context:** All scripts (inline or external) are executed in the **global scope** (`window`) of the host page.

*   **Avoid Global Pollution:**
    *   **Best Practice:** Wrap your entire script content in an Immediately Invoked Function Expression (IIFE) to create a private scope for your variables and functions:
        ```javascript
        (function() {
            // Your component's JS code here
            const myButton = document.getElementById('my-component-button');
            let internalState = {};

            function handleClick() { /* ... */ }

            if (myButton) {
                myButton.addEventListener('click', handleClick);
            }
            console.log('My Component Script Loaded');
        })();
        ```
    *   Alternatively, use ES Modules (`<script type="module">`) if your environment supports them.

*   **Element Selection:** Select elements using the unique IDs or specific class names defined in your component's HTML. Remember these IDs are global.
    *   `document.getElementById('my-component-unique-id')`
    *   Use `querySelector` or `querySelectorAll` scoped to your component's container if possible, *after* you have a reference to the container.

*   **Execution Order:** Scripts are collected by `EMComponent` and executed sequentially *after* the component's body HTML has been injected into the target element in the host page. External scripts (`src="..."`) are waited upon (`onload`) before the next script in the sequence is executed.

*   **DOM Readiness:** Your script can safely assume that the HTML elements defined within its *own* component's `<body>` are present in the DOM when it runs. However, it cannot assume other parts of the host page (or other components) are fully loaded or ready.

*   **Event Listeners:** Add event listeners to your component's elements directly within your script.

*   **Cleanup:** If your script adds global event listeners (e.g., `window.addEventListener('scroll', ...)` or listeners on `document.body`), `EMComponent`'s `detach` method **will not** automatically remove them. You would need to implement custom cleanup logic if required (e.g., expose a cleanup function from your component).

*   **Deduplication:** `EMComponent` attempts to prevent executing the *same external JavaScript file* (based on resolved URL) multiple times. Inline `<script>` code will execute *every time* a component instance is attached. Be careful if inline scripts perform setup actions that should only happen once.

## Key Concepts & Behavior Summary

*   **Global Injection:** Styles and scripts affect the entire page.
*   **Path Resolution:** Relative paths in `href` and `src` attributes (CSS, JS, images, etc.) are automatically resolved relative to the component's HTML file location.
*   **Sequential Script Execution:** Scripts found in the component HTML are executed one after another, in the order they appear, after the component body is injected. External scripts are awaited.
*   **Resource Deduplication:** Attempts are made to load external CSS and JS files only once per unique URL across all component instances.
*   **Unreliable Cleanup:** Removing globally injected styles and scripts upon detachment is attempted but can have side effects and might not fully clean up event listeners added by scripts.

## Limitations & Considerations

*   **ID Clashes:** Duplicate IDs between components or between a component and the host page will cause invalid HTML and unexpected JavaScript behavior. **Use unique, prefixed IDs.**
*   **CSS Conflicts:** Poorly scoped CSS will lead to style conflicts. **Use specific, prefixed selectors.**
*   **Global Scope Pollution:** Variables and functions declared globally in component scripts can clash. **Use IIFEs or Modules.**
*   **Cleanup:** Detaching a component might not fully revert all changes it made (especially complex JS behavior or global event listeners).

## Logging

`EMComponent` includes built-in logging. You can control the verbosity:

```javascript
// Set desired log level (default is 'info')
// Levels: 'debug', 'info', 'warn', 'error', 'none'
EMComponent.logLevel = 'warn';
```

By following these guidelines, you can create components that integrate more reliably into a host page using the EMComponent global injection strategy. Remember that careful namespacing (through prefixes and IIFEs/modules) is crucial for maintainability.

## Contributing

We hope you find EMComponent useful! Contributions are welcome. Please feel free to submit bug reports, feature suggestions, or pull requests.
