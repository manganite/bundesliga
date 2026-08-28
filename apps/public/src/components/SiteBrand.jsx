import markUrl from "../assets/logo-mark.svg";

/**
 * The site brand: the bar mark beside the title, plus the tagline.
 *
 * App.jsx renders TWO header blocks — the shell that stands while the data
 * loads (or fails) and the ready header. Both show the same title, so the brand
 * lives here once: one implementation, like the other shared components. A
 * second copy would drift the moment either half is touched.
 *
 * The mark is decorative. The h1 is the text anchor and already says the name;
 * an alt text would read it twice, so the image is hidden from assistive
 * technology outright (`alt=""` plus `aria-hidden`).
 *
 * The hexes live in the SVG file, not here: assets are outside the token scan
 * (like og-image.png and favicon.svg), and a gradient that has to carry on a
 * dark background is a picture, not a theme colour.
 */
export default function SiteBrand() {
  return (
    <>
      <div className="site-brand">
        <img className="site-mark" src={markUrl} alt="" aria-hidden="true" width="60" height="48" />
        <h1>Bundesliga-Simulator</h1>
      </div>
      <p className="tagline">
        Eine Monte-Carlo-Simulation der Bundesliga — rechnet nach jedem Spieltag mit den
        tatsächlichen Ergebnissen neu. Keine einmalige, starre Prognose.
      </p>
    </>
  );
}
