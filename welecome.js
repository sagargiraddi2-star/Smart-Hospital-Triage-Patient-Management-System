
"use strict";

(() => {
    const NEXT_PAGE = "login.html";
    const TYPE_SPEED = 20;       // Time between letters (ms)
    const EXIT_DURATION = 500;

    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    document.addEventListener("DOMContentLoaded", () => {
        const heading = document.querySelector(".welcome-content h1");
        const text = document.querySelector(".welcome-content p");
        const button = document.querySelector(".welcome-content button");

        if (!heading || !text || !button) return;

        // 1. Fade in the heading
        heading.classList.add("reveal");
        setTimeout(() => heading.classList.add("show"), 200);

        // 2. Type the paragraph one character at a time
        const fullText = text.textContent.trim();

        text.classList.add("reveal");

        const startTyping = () => {
            text.classList.add("show");

            // Show the complete text immediately if reduced motion is enabled
            if (reduceMotion) {
                text.textContent = fullText;
                showButton();
                return;
            }

            text.textContent = "";

            const typedText = document.createElement("span");
            const cursor = document.createElement("span");

            cursor.className = "typing-cursor";
            cursor.textContent = "|";
            cursor.setAttribute("aria-hidden", "true");

            text.append(typedText, cursor);

            const characters = Array.from(fullText);
            let index = 0;

            const typeNextCharacter = () => {
                if (index < characters.length) {
                    typedText.textContent += characters[index];
                    index++;

                    setTimeout(typeNextCharacter, TYPE_SPEED);
                } else {
                    // Keep the blinking cursor after typing finishes
                    showButton();
                }
            };

            typeNextCharacter();
        };

        // 3. Show the button after the paragraph finishes
        const showButton = () => {
            button.classList.add("reveal");
            button.classList.add("show");
        };

        setTimeout(startTyping, reduceMotion ? 0 : 900);

        // 4. Button ripple effect
        const createRipple = (e) => {
            if (reduceMotion) return;

            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const ripple = document.createElement("span");

            ripple.className = "ripple";
            ripple.style.width = ripple.style.height = size + "px";
            ripple.style.left =
                (e.clientX - rect.left - size / 2) + "px";
            ripple.style.top =
                (e.clientY - rect.top - size / 2) + "px";

            button.appendChild(ripple);

            ripple.addEventListener("animationend", () => {
                ripple.remove();
            });
        };

        // 5. Navigate to the next page
        let navigating = false;

        const goNext = () => {
            if (navigating) return;

            navigating = true;
            button.disabled = true;

            if (reduceMotion) {
                window.location.href = NEXT_PAGE;
                return;
            }

            document.body.classList.add("page-exit");

            setTimeout(() => {
                window.location.href = NEXT_PAGE;
            }, EXIT_DURATION);
        };

        button.addEventListener("click", (e) => {
            createRipple(e);
            goNext();
        });

        // Press Enter to continue
        document.addEventListener("keydown", (e) => {
            if (
                e.key === "Enter" &&
                document.activeElement !== button
            ) {
                goNext();
            }
        });

        // 6. Gentle background movement on desktop
        const canHover = window.matchMedia(
            "(hover: hover) and (pointer: fine)"
        ).matches;

        if (canHover && !reduceMotion) {
            let ticking = false;

            document.addEventListener("mousemove", (e) => {
                if (ticking) return;
                ticking = true;

                requestAnimationFrame(() => {
                    const x =
                        (e.clientX / window.innerWidth - 0.5) * 20;
                    const y =
                        (e.clientY / window.innerHeight - 0.5) * 20;

                    document.body.style.backgroundPosition =
                        `center, calc(50% + ${x}px) calc(50% + ${y}px)`;

                    ticking = false;
                });
            });
        }
    });

    // 7. Restore the page when returning with the Back button
    window.addEventListener("pageshow", (e) => {
        if (e.persisted) {
            document.body.classList.remove("page-exit");

            const button = document.querySelector(
                ".welcome-content button"
            );

            if (button) button.disabled = false;
        }
    });
})();
