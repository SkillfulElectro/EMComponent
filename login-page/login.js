// login-page/login.js

console.log('[Login Component Script]: Script file execution started.');


const loginContainer = document.getElementById('login-container');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const statusMessageDiv = document.getElementById('form-status-message');


console.log('[Login Component Script]: Login container selected:', loginContainer);
console.log('[Login Component Script]: Username input selected:', usernameInput);
console.log('[Login Component Script]: Password input selected:', passwordInput);
console.log('[Login Component Script]: Login button selected:', loginButton);
console.log('[Login Component Script]: Status div selected:', statusMessageDiv);


if (usernameInput && passwordInput && loginButton && statusMessageDiv) {
    console.log('[Login Component Script]: All required elements found. Adding click event listener to button...');


    loginButton.addEventListener('click', () => {
        console.log('[Login Component Script]: Login button clicked.');

        const username = usernameInput.value.trim();
        const password = passwordInput.value;


        if (!username || !password) {
            console.warn('[Login Component Script]: Validation failed - username or password empty.');
            displayStatus('Please enter both username and password.', 'error');
            return;
        }


        console.log(`[Login Component Script]: Attempting login for user: ${username}`);
        displayStatus('Logging in...', '');
        loginButton.disabled = true;


        setTimeout(() => {

            if (username === 'user' && password === 'password') {
                console.log('[Login Component Script]: Login successful (simulation).');
                displayStatus(`Welcome back, ${username}!`, 'success');

            } else {
                console.warn('[Login Component Script]: Login failed (simulation).');
                displayStatus('Invalid username or password.', 'error');
                loginButton.disabled = false;
            }
        }, 1000);
    });


    passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            console.log('[Login Component Script]: Enter key pressed in password field.');
            event.preventDefault();
            loginButton.click();
        }
    });

    console.log('[Login Component Script]: Click event listener successfully added to login button.');

} else {

    console.error('[Login Component Script]: FAILED to find all required elements. Event listener NOT added.');
    if (!usernameInput) console.error('  - Username input (#username) not found!');
    if (!passwordInput) console.error('  - Password input (#password) not found!');
    if (!loginButton) console.error('  - Login button (#login-button) not found!');
    if (!statusMessageDiv) console.error('  - Status message div (#form-status-message) not found!');
}


function displayStatus(message, type) {
    if (!statusMessageDiv) {
        console.error('[Login Component Script]: Cannot display status - statusMessageDiv is missing.');
        return;
    }
    statusMessageDiv.textContent = message;
    statusMessageDiv.className = 'status-message';
    if (type) {
        statusMessageDiv.classList.add(type);
    }
}

console.log('[Login Component Script]: Script file execution finished.');