import { useState } from "react";

// ============================================================================
//  A tab strip with ARIA tablist/tab/tabpanel wiring and preview labels.
//
//  ONE component, two call sites (the what-if result table and „Direkte
//  Duelle") — never a second copy, same rule as FixturePrediction. The default
//  tab is chosen by the caller (the most interesting one, so the headline is
//  visible without a click); if that tab later vanishes, the first remaining
//  one takes over.
//
//  @param {Array<{id, label, preview?, content}>} tabs
//  @param {string} defaultId   the tab shown until the user picks another
//  @param {string} idPrefix    unique per instance, so two tab strips on one
//                              page do not share ids
//  @param {string} ariaLabel
// ============================================================================

export default function Tabs({ tabs, defaultId, idPrefix, ariaLabel }) {
  const [selected, setSelected] = useState(null);
  if (!tabs.length) return null;
  const activeId = tabs.some((t) => t.id === selected) ? selected : (defaultId ?? tabs[0].id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <>
      <div role="tablist" aria-label={ariaLabel} className="result-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={t.id === active.id}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={t.id === active.id ? 0 : -1}
            className={t.id === active.id ? "result-tab is-active" : "result-tab"}
            onClick={() => setSelected(t.id)}
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
