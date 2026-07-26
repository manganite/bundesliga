import { useRef, useState } from "react";

// ============================================================================
//  A tab strip with ARIA tablist/tab/tabpanel wiring and preview labels.
//
//  ONE component, two call sites (the what-if result table and „Direkte
//  Duelle") — never a second copy, same rule as FixturePrediction. The default
//  tab is chosen by the caller (the most interesting one, so the headline is
//  visible without a click); if that tab later vanishes, the first remaining
//  one takes over.
//
//  Keyboard (§Codex §3, ARIA Authoring Practices tabs pattern): ← / → move
//  focus AND selection cyclically, Home/End jump to the ends. Roving tabindex
//  stays — only the active tab is in the tab order, the arrows reach the rest.
//  One component, so every consumer gets this for free.
//
//  @param {Array<{id, label, preview?, content}>} tabs
//  @param {string} defaultId   the tab shown until the user picks another
//  @param {string} idPrefix    unique per instance, so two tab strips on one
//                              page do not share ids
//  @param {string} ariaLabel
// ============================================================================

export default function Tabs({ tabs, defaultId, idPrefix, ariaLabel }) {
  const [selected, setSelected] = useState(null);
  const btnRefs = useRef({});
  if (!tabs.length) return null;
  const activeId = tabs.some((t) => t.id === selected) ? selected : (defaultId ?? tabs[0].id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const activeIndex = tabs.findIndex((t) => t.id === active.id);

  // Selection follows focus (automatic activation): moving to a tab selects it
  // and moves the focus there, so a screen-reader and a sighted keyboard user
  // see the same panel.
  const move = (index) => {
    const t = tabs[(index + tabs.length) % tabs.length];
    setSelected(t.id);
    btnRefs.current[t.id]?.focus();
  };

  const onKeyDown = (e) => {
    let handled = true;
    switch (e.key) {
      case "ArrowRight": move(activeIndex + 1); break;
      case "ArrowLeft": move(activeIndex - 1); break;
      case "Home": move(0); break;
      case "End": move(tabs.length - 1); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  };

  return (
    <>
      <div role="tablist" aria-label={ariaLabel} className="result-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => { btnRefs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={t.id === active.id}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={t.id === active.id ? 0 : -1}
            className={t.id === active.id ? "result-tab is-active" : "result-tab"}
            onClick={() => setSelected(t.id)}
            onKeyDown={onKeyDown}
          >
            {t.label}{t.preview ? <span className="tab-preview"> {t.preview}</span> : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${active.id}`}
        aria-labelledby={`${idPrefix}-tab-${active.id}`}
      >
        {active.content}
      </div>
    </>
  );
}
