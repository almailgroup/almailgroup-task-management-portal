import { en } from "./en";
import { ar } from "./ar";

/**
 * Two languages, one dictionary shape.
 *
 * `en` is the source of truth; `ar` is typed against it, so a key added to one
 * without the other fails to compile rather than falling back to English at
 * runtime in front of an Arabic reader. Keys are flat and namespaced —
 * "nav.dashboard" — which keeps them greppable and gives autocomplete.
 */
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export type TranslationKey = keyof typeof en;

/**
 * The stem of a counted phrase: "count.tasks" for "count.tasks_one" and
 * "count.tasks_other". Only stems with an `_other` form qualify, since that
 * is the form every language falls back to.
 */
export type PluralStem = TranslationKey extends infer K
  ? K extends `${infer S}_other`
    ? S
    : never
  : never;

/**
 * English needs two plural forms; Arabic needs up to six. A dictionary has
 * every English key, and may add the four extra forms Arabic grammar asks for.
 */
type ExtraPluralForm = `${string}_${"zero" | "two" | "few" | "many"}`;
export type Dictionary = Record<TranslationKey, string> &
  Partial<Record<ExtraPluralForm, string>>;

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Text direction for the document. */
export function directionFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The BCP 47 tag handed to Intl.
 *
 * English keeps the browser's own default, exactly as before this existed, so
 * nobody's date format changes underneath them. Arabic pins Western digits:
 * a shipping company reads container numbers and amounts in the digits its
 * documents use, and mixing two digit systems on one screen is worse than
 * either alone.
 */
export function localeTag(locale: Locale): string | undefined {
  return locale === "ar" ? "ar-AE-u-nu-latn" : undefined;
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * The translator for one locale.
 *
 * `t` looks a key up and fills `{name}` placeholders. `tn` is for counts:
 * Arabic has six plural categories to English's two, so a counted phrase is
 * stored as `key_one`, `key_other` and — where Arabic needs them — `key_zero`,
 * `key_two`, `key_few`, `key_many`. Intl.PluralRules picks; anything missing
 * falls back to `_other`.
 */
export function createTranslator(locale: Locale) {
  const dict = dictionaryFor(locale);
  const rules = new Intl.PluralRules(locale === "ar" ? "ar" : "en");

  const loose = dict as Record<string, string | undefined>;
  const looseEn = en as Record<string, string | undefined>;

  const t = (key: TranslationKey, vars?: Vars): string =>
    interpolate(dict[key] ?? en[key] ?? key, vars);

  const tn = (key: PluralStem, count: number, vars?: Vars): string => {
    const category = rules.select(count);
    const template =
      loose[`${key}_${category}`] ??
      loose[`${key}_other`] ??
      looseEn[`${key}_${category}`] ??
      looseEn[`${key}_other`] ??
      key;
    return interpolate(template, { n: count, ...vars });
  };

  /**
   * A message that may be a key.
   *
   * Server Actions and the database helpers return their messages as keys —
   * "action.sessionExpired" — so the same action serves every language. A
   * message that is not a key, such as an error the database composed itself,
   * is shown as it is.
   */
  const tm = (message: string): string =>
    loose[message] ?? looseEn[message] ?? message;

  return {
    locale,
    dir: directionFor(locale),
    tag: localeTag(locale),
    t,
    tn,
    tm,
  };
}

export type Translator = ReturnType<typeof createTranslator>;
