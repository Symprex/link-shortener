// Proves the fix for the "parses but never applies" defect this module's overrides
// suffered: THEME_CSS declared its --pico-* overrides on bare `:root` (specificity
// 0,1,0), while vendored Pico 2.1.1 (src/vendor/pico.ts) declares the same variables on
// `:root:not([data-theme=dark]),[data-theme=light]` in light mode and
// `:root:not([data-theme])` in its own dark media block — both specificity 0,2,0. Pico
// won in both colour schemes regardless of source order, so every override here except
// --pico-border-color was inert. A test asserting only that the declarations are present
// in the CSS text (the previous state of coverage here) cannot catch this — presence is
// exactly the thing that was true and still broken. This asserts the selector itself
// carries a `:not(...)` attribute-selector class, matching Pico's specificity rather than
// merely sitting in the same document.
import { describe, expect, it } from "vitest";
import { PICO_CSS } from "./vendor/pico.ts";
import { THEME_CSS } from "./theme.ts";

/**
 * Finds the selector immediately governing the block that declares
 * `--pico-background-color`, in source order. Used against both PICO_CSS (to confirm the
 * fact being guarded against, independently of theme.ts) and THEME_CSS (to prove the fix).
 */
function selectorsGoverningPicoBackgroundColor(css: string): string[] {
  const selectors: string[] = [];
  // Matches "<selector>{...--pico-background-color..." (Pico's minified rule, no space
  // before "{") and "<selector> {\n  ...--pico-background-color..." (theme.ts's
  // hand-written rule) alike, non-greedily up to the first --pico-background-color.
  const pattern = /([^{}\n]*:root[^{}]*)\s*\{[^}]*?--pico-background-color\s*:/g;
  for (const match of css.matchAll(pattern)) {
    selectors.push(match[1].trim());
  }
  return selectors;
}

describe("THEME_CSS's --pico-* overrides", () => {
  it("confirms Pico itself gates --pico-background-color behind :not([data-theme...]), not bare :root (the fact this fix depends on)", () => {
    const picoSelectors = selectorsGoverningPicoBackgroundColor(PICO_CSS);
    // Light selector, then dark (inside prefers-color-scheme: dark).
    expect(picoSelectors.length).toBeGreaterThanOrEqual(2);
    for (const selector of picoSelectors) {
      expect(selector).toContain(":not(");
    }
  });

  it("declares --pico-background-color on a selector carrying Pico's own :not([data-theme...]) specificity class, in both the light block and the dark media block", () => {
    const ourSelectors = selectorsGoverningPicoBackgroundColor(THEME_CSS);
    // One in the plain light block, one inside @media (prefers-color-scheme: dark).
    expect(ourSelectors.length).toBe(2);
    for (const selector of ourSelectors) {
      // Bare ":root" has specificity 0,1,0 and loses to Pico's 0,2,0 selector regardless
      // of source order — this is the defect. A selector adding a ":not(...)" clause
      // (an attribute-selector-class pseudo) reaches at least 0,2,0, matching Pico's.
      expect(selector).toContain(":not(");
    }
  });

  it("matches, for the light block, exactly the same set of root data-theme states as Pico's own light selector", () => {
    // Containing ":not(" is not enough: ":root:not([data-theme])" carries the class but
    // stops matching the instant a page sets data-theme="light" — silently going inert
    // again, the exact defect just fixed for the case where no attribute is ever set.
    // Pico's own light rule is ":root:not([data-theme=dark]),[data-theme=light]" (plus a
    // ":host(...)" alternative irrelevant to a plain page), which still matches when
    // data-theme="light" is present. This proves our selector matches the identical set
    // of states — absent, "dark", "light" — that Pico's does, independently of how
    // theme.ts spells it.
    const picoLightSelector = selectorsGoverningPicoBackgroundColor(PICO_CSS)[0];
    const ourLightSelector = selectorsGoverningPicoBackgroundColor(THEME_CSS)[0];
    const dataThemeStates: (string | undefined)[] = [undefined, "dark", "light"];
    for (const dataTheme of dataThemeStates) {
      expect(selectorMatchesRootElement(ourLightSelector, dataTheme)).toBe(
        selectorMatchesRootElement(picoLightSelector, dataTheme),
      );
    }
  });

  it("matches, for the dark block, exactly the same set of root data-theme states as Pico's own dark media-block selector", () => {
    // The dark block's selector is a literal mirror of Pico's own dark-mode selector
    // (":root:not([data-theme])"), so this is expected to hold trivially today — but
    // asserting it makes the pair symmetric with the light-block check above and catches
    // the same class of silent drift if either selector is ever hand-edited.
    const picoDarkSelector = selectorsGoverningPicoBackgroundColor(PICO_CSS)[1];
    const ourDarkSelector = selectorsGoverningPicoBackgroundColor(THEME_CSS)[1];
    const dataThemeStates: (string | undefined)[] = [undefined, "dark", "light"];
    for (const dataTheme of dataThemeStates) {
      expect(selectorMatchesRootElement(ourDarkSelector, dataTheme)).toBe(
        selectorMatchesRootElement(picoDarkSelector, dataTheme),
      );
    }
  });
});

describe("compoundSelectorMatchesRootElement (the oracle's own vocabulary check)", () => {
  it("refuses to silently drop unmodelled vocabulary from a compound it partially recognises", () => {
    // ":root.foo" tokenises to [":root"] under the fixed regex, and a naive `every` over
    // only the found tokens reads that as "matches" — silently discarding the ".foo" clause
    // that would actually change whether the selector matches. A future author could add a
    // clause like this to theme.ts's selectors and the oracle would wrongly agree it still
    // matches the same states as Pico's, exactly the failure mode item 1 describes.
    expect(() => compoundSelectorMatchesRootElement(":root.foo", undefined)).toThrow();
  });

  it("refuses to silently read a wholly unmodelled compound as non-matching", () => {
    // A compound built entirely from vocabulary the regex does not recognise (no ":root",
    // no ":not([data-theme...])", no "[data-theme...]") tokenises to no matches at all, and
    // `tokens.every(...)` over an empty array is vacuously true — but the guard before that
    // returns false for "no tokens found" without ever checking that nothing was missed.
    // Either way the oracle must not answer with confidence about a selector it never
    // parsed; it must say so.
    expect(() => compoundSelectorMatchesRootElement(".foo", undefined)).toThrow();
  });
});

/**
 * A minimal, independent CSS selector matcher covering exactly the vocabulary these two
 * files use for their :root rules — ":root", ":host(...)", ":not([data-theme])",
 * ":not([data-theme=x])" and "[data-theme=x]", combined with ",". Implements attribute-
 * selector semantics from the CSS spec directly (not from theme.ts's own logic), so it can
 * tell whether two differently-spelled selectors match the same set of `data-theme` states
 * on the document root element without asserting on the implementation's own reasoning.
 */
function selectorMatchesRootElement(selectorList: string, dataTheme: string | undefined): boolean {
  return selectorList
    .split(",")
    .some((compound) => compoundSelectorMatchesRootElement(compound.trim(), dataTheme));
}

function compoundSelectorMatchesRootElement(
  compound: string,
  dataTheme: string | undefined,
): boolean {
  // :host(...) only ever matches a shadow-DOM host, never the plain document root these
  // pages render to, so a compound built on it never matches here.
  if (compound.includes(":host(")) return false;
  const tokens = compound.match(
    /:root|:not\(\[data-theme(?:=([^\]]+))?\]\)|\[data-theme(?:=([^\]]+))?\]/g,
  );
  // The regex above must account for the whole compound (whitespace aside), not just the
  // part it happens to recognise — otherwise ":root.foo" reads as a bare ":root" match with
  // the ".foo" clause silently dropped, and a compound built entirely from vocabulary the
  // regex does not model (no tokens found) reads as "does not match" rather than "unknown".
  // Both directions can make the equality assertion above hold by discarding exactly the
  // part of a future selector that would break the cascade, so this fails loudly instead of
  // guessing.
  const compact = compound.replace(/\s+/g, "");
  const recognised = (tokens ?? []).join("");
  if (recognised !== compact) {
    throw new Error(
      `selectorMatchesRootElement's oracle does not model the full compound "${compound}" ` +
        `— only recognised "${recognised}". Extend its vocabulary before trusting it here.`,
    );
  }
  return (tokens ?? []).every((token) => {
    if (token === ":root") return true;
    const notMatch = /^:not\(\[data-theme(?:=([^\]]+))?\]\)$/.exec(token);
    if (notMatch) return !attributeConditionMatches(dataTheme, notMatch[1]);
    const attrMatch = /^\[data-theme(?:=([^\]]+))?\]$/.exec(token);
    if (attrMatch) return attributeConditionMatches(dataTheme, attrMatch[1]);
    return false;
  });
}

// An attribute selector with a value ("[data-theme=x]") matches only that exact value; one
// with no value ("[data-theme]") matches any presence of the attribute at all.
function attributeConditionMatches(
  dataTheme: string | undefined,
  value: string | undefined,
): boolean {
  return value === undefined ? dataTheme !== undefined : dataTheme === value;
}
