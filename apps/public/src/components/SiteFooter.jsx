// ============================================================================
//  The site footer — three lines (§UEBERSICHT_HEADER_FOOTER §2.3).
//
//    1. Identity: name · version · licence · source. The version is a
//       maintained release number plus a build stamp injected at build time.
//    2. The §0 honesty sentence, sitewide — the app's signature.
//    3. Sources, short. The PARAMETER PROVENANCE deliberately does NOT live
//       here; it moved to Methodik step 4, where it answers a question. A scan
//       forbids it returning to the footer.
// ============================================================================

const REPO = "https://github.com/manganite/bundesliga";
const GPL = "https://www.gnu.org/licenses/gpl-3.0.html";

export default function SiteFooter({ version, buildStamp }) {
  return (
    <footer className="footer">
      <p className="footer-identity">
        Bundesliga-Simulator · v{version} · Code{" "}
        <a href={GPL} rel="noreferrer">GPL-3.0</a> ·{" "}
        <a href={REPO} rel="noreferrer">Quellcode</a>
        {buildStamp ? <span className="footer-build"> · Build {buildStamp}</span> : null}
      </p>
      <p>
        Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings.
        Die Modellparameter bleiben während der Saison unverändert.
      </p>
      <p>
        Ergebnisse &amp; Spielpläne: <a href="https://www.openligadb.de/" rel="noreferrer">OpenLigaDB</a>{" "}
        (<a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noreferrer">ODbL 1.0</a>) ·
        Ratings: <a href="http://clubelo.com/" rel="noreferrer">clubelo.com</a>
      </p>
    </footer>
  );
}
