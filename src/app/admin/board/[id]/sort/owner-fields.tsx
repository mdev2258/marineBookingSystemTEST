/**
 * The owner, on Sort, Quick add and the boat file. Optional: a boat can exist
 * with nobody's name on it. But the email is where estimates, extra work and
 * the owner's boat link go, so without one the app sends nothing -- and says
 * so, rather than claiming it did.
 */
export function OwnerFields({ error, note }: { error?: boolean; note?: string }) {
  return (
    <fieldset
      className="space-y-3"
      aria-invalid={error || undefined}
      aria-describedby={error ? 'owner-error' : undefined}
    >
      <legend className="k">Owner</legend>
      <p className="text-[12.5px] muted">
        {note ?? 'Only for a boat with no owner on file yet. Leave blank if you don’t know.'}
      </p>
      {error && (
        <p id="owner-error" role="alert" className="text-[13.5px] font-semibold text-accent-800">
          An owner needs a name and an email address that looks right.
        </p>
      )}
      <div>
        <label htmlFor="ownerName" className="k block muted">
          Name
        </label>
        <input
          id="ownerName"
          name="ownerName"
          type="text"
          autoComplete="off"
          className="mt-1 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
        />
      </div>
      <div>
        <label htmlFor="ownerEmail" className="k block muted">
          Email
        </label>
        <input
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          autoComplete="off"
          className="mt-1 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
        />
      </div>
      <div>
        <label htmlFor="ownerPhone" className="k block muted">
          Phone (optional)
        </label>
        <input
          id="ownerPhone"
          name="ownerPhone"
          type="tel"
          autoComplete="off"
          className="mt-1 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
        />
      </div>
    </fieldset>
  );
}
