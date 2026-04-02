/**
 * Reference-counted body scroll lock for stacked overlays (drawers, mobile nav, etc.).
 * First lock saves inline overflow; last unlock restores it. Prevents one close from
 * clearing scroll while another overlay is still open.
 */
let lockCount = 0;
let savedOverflow = "";

export function lockBodyScroll() {
    if (lockCount === 0) {
        savedOverflow = document.body.style.overflow;
        //document.body.style.overflow = "hidden";
    }
    lockCount += 1;
}

export function unlockBodyScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
        //document.body.style.overflow = savedOverflow;
    }
}
