/**
 * Shared Components Loader
 * DRY utility to load common HTML components and set active states
 */

// Component loader utility
async function loadComponent(selector, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        document.querySelector(selector).innerHTML = html;
    } catch (error) {
        console.error(`Failed to load component: ${componentPath}`, error);
    }
}

// Set active navigation state based on current page
function setActiveNavigation() {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === currentPage) {
            item.classList.add('active');
        }
    });
}

// Initialize common components
async function initializeSharedComponents() {
    // Load navigation if container exists
    const navContainer = document.querySelector('#navigation-container');
    if (navContainer) {
        await loadComponent('#navigation-container', 'components/navigation.html');
        setActiveNavigation();
    }
    
    // Load footer if container exists
    const footerContainer = document.querySelector('#footer-container');
    if (footerContainer) {
        await loadComponent('#footer-container', 'components/footer.html');
    }
    
    // Load floating elements if container exists
    const floatingContainer = document.querySelector('#floating-elements-container');
    if (floatingContainer) {
        await loadComponent('#floating-elements-container', 'components/floating-elements.html');
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSharedComponents);

// Export for manual use
window.SharedComponents = {
    loadComponent,
    setActiveNavigation,
    initializeSharedComponents
};