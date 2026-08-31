import type { Filters } from "../../shared/filters";
import { emirates, priceLabels } from "../../shared/filters";
import type { PropertyType } from "../../shared/types";
import { IconChevronDown } from "../icons";

const types: (PropertyType | "All")[] = ["All", "Apartment", "Penthouse", "Villa", "Townhouse"];
const bedOptions: { label: string; value: number | null }[] = [
  { label: "Any beds", value: null },
  { label: "Studio", value: 0 },
  { label: "1 bed", value: 1 },
  { label: "2 beds", value: 2 },
  { label: "3 beds", value: 3 },
  { label: "4+ beds", value: 4 },
];

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <>
      <div className="seg" role="tablist" aria-label="Emirate">
        {emirates.map((e) => (
          <button
            key={e}
            role="tab"
            aria-selected={filters.emirate === e}
            className={`seg-item${filters.emirate === e ? " active" : ""}`}
            onClick={() => onChange({ ...filters, emirate: e })}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="chip-row">
        <ChipSelect
          value={filters.type}
          options={types.map((t) => ({ label: t === "All" ? "All types" : `${t}s`, value: t }))}
          onChange={(type) => onChange({ ...filters, type })}
        />
        <ChipSelect
          value={filters.beds}
          options={bedOptions}
          onChange={(beds) => onChange({ ...filters, beds })}
        />
        <ChipSelect
          value={filters.price}
          options={(Object.keys(priceLabels) as Filters["price"][]).map((p) => ({
            label: priceLabels[p],
            value: p,
          }))}
          onChange={(price) => onChange({ ...filters, price })}
        />
        <div className="score-chip">
          <label htmlFor="minscore">
            Score ≥ <b className="tnum">{filters.minScore}</b>
          </label>
          <input
            id="minscore"
            type="range"
            min={0}
            max={95}
            step={5}
            value={filters.minScore}
            onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
            className="slider"
            style={{ height: 5, ["--fill" as string]: `${(filters.minScore / 95) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}

function ChipSelect<T extends string | number | null>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  const isDefault = value === options[0].value;
  return (
    <div className={`chip-select${isDefault ? "" : " set"}`}>
      <select
        value={String(value)}
        aria-label={options[0].label}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value)!;
          onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown size={12} strokeWidth={2} />
    </div>
  );
}
