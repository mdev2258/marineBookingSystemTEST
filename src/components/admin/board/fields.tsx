/**
 * The two fields that appear on both Sort and Quick add.
 *
 * The boat field is a native <input list> + <datalist>: it types ahead over
 * every boat on the books with no JavaScript, no combobox library and no
 * hydration, and -- crucially -- it still accepts a name that is not in the
 * list. Typing an unknown boat creates it (see findOrCreateVessel). A real
 * combobox would have to be taught that; a text input already knows.
 */
export function BoatField({
  vessels,
  defaultValue = '',
  autoFocus = false,
}: {
  vessels: { name: string }[];
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor="vesselName" className="k">
        Boat
      </label>
      <input
        id="vesselName"
        name="vesselName"
        type="text"
        list="known-boats"
        autoFocus={autoFocus}
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder="Start typing, or a new name"
        className="mt-2 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
      />
      <datalist id="known-boats">
        {vessels.map((v) => (
          <option key={v.name} value={v.name} />
        ))}
      </datalist>
      <p className="mt-1 text-[12.5px] muted">
        A name that isn&rsquo;t on the list gets added as a new boat.
      </p>
    </div>
  );
}

/** Where the work happens, which may not be where the boat usually lives. */
export function PlaceField({
  places,
  defaultValue = '',
}: {
  places: { id: string; name: string }[];
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor="placeId" className="k">
        Where
      </label>
      <select
        id="placeId"
        name="placeId"
        defaultValue={defaultValue}
        className="mt-2 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
      >
        <option value="">Wherever the boat is</option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
