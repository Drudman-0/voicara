// =========================================
// SHE RISES SA
// MAIN JAVASCRIPT
// =========================================


// Mobile navigation

const mobileMenu = document.getElementById("mobileMenu");

if (mobileMenu) {

    mobileMenu.addEventListener("click", function () {

        alert("Mobile navigation will be added in the next version.");

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

if (password === "12345") {
    // login
}

const SUPABASE_URL = "https://upntuixdqaisaixzilqk.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_bAUFzae-MUlky5TIYhpk9g_4bV9TdvT";s