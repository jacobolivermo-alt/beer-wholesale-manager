// Runs before services initialize. Never replace a pre-existing local account.
window.beerFirstVisit = !localStorage.getItem('beer-manager:v1');
if (!window.beerFirstVisit && !localStorage.getItem('beer-manager:account-mode')) localStorage.setItem('beer-manager:account-mode', 'LIVE');
