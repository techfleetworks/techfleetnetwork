## Change

Remove the "Subscribe in Google" button from the Events page (Community tab toolbar).

## File

`src/pages/EventsPage.tsx`

- Delete the `<Button>` block on lines 129–134 (the `Subscribe in Google` button + its `<a>` and `CalendarPlus` icon).
- Remove the now-unused `ADD_TO_GOOGLE_URL` constant on line 14.
- If `CalendarPlus` is no longer referenced anywhere else in the file, drop it from the `lucide-react` import.

The "Copy iCal link" and "Open in Google" buttons remain, so users can still subscribe via Apple/Outlook or open the calendar in Google.

No DB, no schema, no other components touched.
