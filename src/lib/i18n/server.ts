import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  createTranslator,
  isLocale,
  type Locale,
} from "./index";

/** The reader's language, from the cookie the selector sets. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Server-side translator for Server Components and Server Actions. */
export const getI18n = cache(async () => createTranslator(await getLocale()));
