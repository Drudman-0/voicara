// =========================================
// SHE RISES SA
// MAIN JAVASCRIPT
// =========================================


// Mobile navigation

const mobileMenu = document.getElementById("mobileMenu");
const navLinks = document.querySelector(".nav-links");

if (mobileMenu && navLinks) {
    mobileMenu.addEventListener("click", function () {
        navLinks.classList.toggle("mobile-open");
    });
}


// =========================================
// SCROLL ANIMATION
// =========================================

const cards = document.querySelectorAll(".action-card");

const observer = new IntersectionObserver(
    entries => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";

            }

        });

    },
    {
        threshold: 0.15
    }
);


cards.forEach(card => {

    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "opacity 0.6s ease, transform 0.6s ease";

    observer.observe(card);

});