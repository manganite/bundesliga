// ============================================================================
//  „Wie gerechnet?" — the shared method disclosure (§ZONEN_LAYOUT §3).
//
//  ONE component, extracted from „Wichtigstes kommendes Spiel" and consumed
//  everywhere — never a second copy, the FixturePrediction/Tabs rule. It holds
//  the methodology so a card's visible caption can stay to one or two sentences
//  in the user's language while nothing honest is lost: §4/§8 wordings, sample
//  sizes and normalisation notes move BEHIND the toggle, they do not vanish.
//
//  A native <details> is used deliberately: it is keyboard- and
//  screen-reader-accessible without any JavaScript and renders its content in
//  the DOM (so a source/anchor test sees both parts).
// ============================================================================

export default function Disclosure({ summary = "Wie gerechnet?", children }) {
  return (
    <details className="method-disclosure">
      <summary>{summary}</summary>
      <div className="method-body">{children}</div>
    </details>
  );
}
