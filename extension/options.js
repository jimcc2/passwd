document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api-url');
    const saveButton = document.getElementById('save');
    const statusDiv = document.getElementById('status');

    // Load the saved API URL and display it in the input field.
    chrome.storage.sync.get('apiUrl', (data) => {
        if (data.apiUrl) {
            apiUrlInput.value = data.apiUrl;
        }
    });

    // Save the API URL when the save button is clicked.
    saveButton.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim();
        if (apiUrl) {
            chrome.storage.sync.set({ apiUrl: apiUrl }, () => {
                statusDiv.textContent = 'Options saved.';
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 2000);
            });
        }
    });
});
