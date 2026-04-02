import "./Style.css";
const { useState, useEffect, useMemo, useCallback } = React;
const svgMap = window.svgMap;
import { countryCodes, countryCoordinates } from "./countryCodes.js";
import CountryDetailDrawer from "./CountryDetailDrawer.js";

/**
 * Optional: per-country device mix (when your API adds `device_type` on each country row):
 *
 *   import DeviceTypeInteractions from "../DeviceTypeInteractions";
 *   <Map
 *     ...
 *     renderCountryPanelExtras={(c) =>
 *       c.device_type ? (
 *         <DeviceTypeInteractions
 *           title="Device mix in this country"
 *           activeData={{ device_type: c.device_type, Total: c.num?.total }}
 *           fromDate={fromDate}
 *           toDate={toDate}
 *           demoMode={demoMode}
 *         />
 *       ) : null
 *     }
 *   />
 */

function colorCalulator(value) {
    const baseColor = "#c09f53";
    const base = {
        r: parseInt(baseColor.substring(1, 3), 16),
        g: parseInt(baseColor.substring(3, 5), 16),
        b: parseInt(baseColor.substring(5, 7), 16),
    };
    const opacity = (value / 100) * (1 - 0.1) + 0.46;
    return `rgba(${base.r}, ${base.g}, ${base.b}, ${opacity})`;
}

function buildCodeToName() {
    const m = {};
    Object.entries(countryCodes).forEach(([name, code]) => {
        if (code && m[code] == null) m[code] = name;
    });
    return m;
}

const CODE_TO_NAME = buildCodeToName();

export default function Map(props) {
    const data = props.data;
    const total = data?.total;
    const countries = data?.Countries;
    const demoMode = props.demoMode;
    const renderCountryPanelExtras = props.renderCountryPanelExtras;

    const [selected, setSelected] = useState(null);
    const closeDrawer = useCallback(() => setSelected(null), []);
    const [visibleCount, setVisibleCount] = useState(12);

    const mapCountries = useMemo(() => {
        if (!countries?.length) return {};
        const parts = countries
            .filter((country) => country.country !== "Unknown")
            .map((country) => {
                const code = countryCodes[country.country];
                if (!code) return null;
                return {
                    [code]: {
                        date: data?.date ? data.date : "No data",
                        total: demoMode
                            ? `${country.num.total > 9999 ? String(country.num.total).slice(0, 2) : String(country.num.total).slice(0, 1)}${country.num.total > 999 ? "k" : "**"}`
                            : country.num.total,
                        accepted: country.accepted,
                        rejected: country.declined,
                        functional: country.functional,
                        statistics: country.statics,
                        marketing: country.marketing,
                        color: colorCalulator(country.num.total),
                        acceptedTotal: demoMode
                            ? `${country.num.accepted > 9999 ? String(country.num.accepted).slice(0, 2) : String(country.num.accepted).slice(0, 1)}${country.num.accepted > 999 ? "k" : "**"}`
                            : country.num.accepted,
                        rejectedTotal: demoMode
                            ? `${country.num.rejected > 9999 ? String(country.num.rejected).slice(0, 2) : String(country.num.rejected).slice(0, 1)}${country.num.rejected > 999 ? "k" : "**"}`
                            : country.num.rejected,
                        functionalTotal: demoMode
                            ? `${country.num.functional > 9999 ? String(country.num.functional).slice(0, 2) : String(country.num.functional).slice(0, 1)}${country.num.functional > 999 ? "k" : "**"}`
                            : country.num.functional,
                        statisticsTotal: demoMode
                            ? `${country.num.statics > 9999 ? String(country.num.statics).slice(0, 2) : String(country.num.statics).slice(0, 1)}${country.num.statics > 999 ? "k" : "**"}`
                            : country.num.statics,
                        marketingTotal: demoMode
                            ? `${country.num.marketing > 9999 ? String(country.num.marketing).slice(0, 2) : String(country.num.marketing).slice(0, 1)}${country.num.marketing > 999 ? "k" : "**"}`
                            : country.num.marketing,
                    },
                };
            })
            .filter(Boolean);
        return Object.assign({}, ...parts);
    }, [countries, data?.date, demoMode]);

    const resolveSelection = useCallback(
        (isoCode) => {
            if (!isoCode) return;
            if (!countries?.length) {
                setSelected({
                    country: CODE_TO_NAME[isoCode] || isoCode,
                    num: {},
                    __iso: isoCode,
                    __empty: true,
                });
                return;
            }
            const row = countries.find((c) => countryCodes[c.country] === isoCode);
            if (row) {
                setSelected({ ...row, __iso: isoCode });
            } else {
                setSelected({
                    country: CODE_TO_NAME[isoCode] || isoCode,
                    num: {},
                    __iso: isoCode,
                    __empty: true,
                });
            }
        },
        [countries]
    );

    useEffect(() => {
        if (!countries?.length) return undefined;
        const el = document.getElementById("svgMap");
        if (!el) return undefined;

        el.innerHTML = "";
        let zoomLevel = 1.2;
        let center = [0, 0];

        if (countries.length > 0) {
            const min = Math.min(...countries.map((country) => country.num.total));
            const max = Math.max(...countries.map((country) => country.num.total));

            if (max - min > 3000) {
                zoomLevel = 1.5;

                const lat = countries
                    .map((country) => {
                        const code = countryCodes[country.country];
                        const coords = countryCoordinates[code];
                        return coords ? [coords.lat, coords.lng] : undefined;
                    })
                    .filter((lat) => lat !== undefined);

                const lng = countries
                    .map((country) => {
                        const code = countryCodes[country.country];
                        const coords = countryCoordinates[code];
                        return coords ? [coords.lat, coords.lng] : undefined;
                    })
                    .filter((lng) => lng !== undefined);

                const latMin = Math.min(...lat);
                const latMax = Math.max(...lat);

                const lngMin = Math.min(...lng);
                const lngMax = Math.max(...lng);

                center = [(latMax + latMin) / 2, (lngMax + lngMin) / 2];
            }
        }

        new svgMap({
            targetElementID: "svgMap",
            data: {
                data: {
                    total: {
                        name: "Total Interactions",
                        format: "{0}",
                        thousandSeparator: ".",
                        thresholdMax: 800,
                        thresholdMin: 10,
                    },
                    accepted: {
                        name: "Accepted Consents",
                        format: "{0}%",
                        thousandSeparator: ".",
                        thresholdMax: 800,
                        thresholdMin: 10,
                    },
                    rejected: {
                        name: "Rejected Consents",
                        format: "{0}%",
                        thousandSeparator: ".",
                        thresholdMax: 800,
                        thresholdMin: 10,
                    },
                    functional: {
                        name: "Functional Consents",
                        format: "{0}%",
                        thousandSeparator: ".",
                        thresholdMax: 800,
                        thresholdMin: 10,
                    },
                    statistics: {
                        name: "Statistics Consents",
                        format: "{0}%",
                        thousandSeparator: ".",
                        thresholdMax: 800,
                        thresholdMin: 10,
                    },
                    marketing: {
                        name: "Marketing Consents",
                        format: "{0}%",
                        thousandSeparator: ".",
                        thresholdMax: 800,
                        thresholdMin: 10,
                    },
                },
                applyData: "total",
                values: mapCountries,
            },
            onGetTooltip: (tooltipDiv, countryID, countryValues) => {
                if (!countryValues) return "";
                const fmt = (n) => (n != null && !isNaN(n) ? (typeof n === "number" ? n.toLocaleString("de-DE") : n) : "-");
                const rows = [
                    { label: "Country", value: countryID, total: null },
                    { label: "Total", value: countryValues.total, total: null },
                    { label: "Accepted", value: countryValues.accepted, total: countryValues.acceptedTotal },
                    { label: "Functional", value: countryValues.functional, total: countryValues.functionalTotal },
                    { label: "Statistics", value: countryValues.statistics, total: countryValues.statisticsTotal },
                    { label: "Marketing", value: countryValues.marketing, total: countryValues.marketingTotal },
                    { label: "Rejected", value: countryValues.rejected, total: countryValues.rejectedTotal },
                ];
                return rows
                    .map((r) =>
                        r.total != null
                            ? `${r.label}: ${r.value}% (${fmt(r.total)})`
                            : `${r.label}: ${fmt(r.value)}`
                    )
                    .join("\n");
            },
            initialZoom: zoomLevel,
            initialLocation: center,
        });

        const onMapClick = (e) => {
            const node = e.target.closest?.("[data-id]");
            if (!node || !el.contains(node)) return;
            const code = node.getAttribute("data-id");
            if (code) resolveSelection(code);
        };
        el.addEventListener("click", onMapClick);
        return () => el.removeEventListener("click", onMapClick);
    }, [countries, mapCountries, demoMode, resolveSelection]);

    useEffect(() => {
        const updateVisibleCount = () => {
            const scroll = document.querySelector(".world-map__list-scroll");
            if (scroll) {
                const rowH = 44;
                const n = Math.floor(scroll.clientHeight / rowH);
                setVisibleCount(n > 0 ? Math.max(5, n) : 12);
            }
        };
        updateVisibleCount();
        window.addEventListener("resize", updateVisibleCount);
        const t = window.setTimeout(updateVisibleCount, 400);
        return () => {
            window.removeEventListener("resize", updateVisibleCount);
            window.clearTimeout(t);
        };
    }, [countries]);

    if (!countries?.length) {
        return (
            <div className="world-map world-map--empty">
                <p className="world-map__empty-msg">No geographic data for this period.</p>
            </div>
        );
    }

    const ranked = [...countries]
        .filter((c) => c.country !== "Unknown")
        .sort((a, b) => b.num.total - a.num.total);

    return (
        <>
            <div className="world-map">
                <div className="world-map__main">
                    <header className="world-map__header">
                        <h2 className="world-map__title">Global consent activity</h2>
                        <p className="world-map__subtitle">
                            Darker regions indicate more interactions. Click any country to open a detailed breakdown.
                        </p>
                    </header>
                    <div className="world-map__map-shell">
                        <div id="svgMap" className="world-map__map-inner" />
                    </div>
                </div>
                <aside className="world-map__side" aria-label="Top countries by volume">
                    <div className="world-map__side-head">
                        <h3 className="world-map__side-title">Top markets</h3>
                        <p className="world-map__side-hint">Ranked by interactions · select to explore</p>
                    </div>
                    <div className="world-map__list-scroll">
                        {ranked.slice(0, visibleCount).map((c, key) => {
                            const code = countryCodes[c.country];
                            const pctBar = total > 0 ? Math.min(100, (c.num.total / total) * 100) : 0;
                            return (
                                <button
                                    key={`${c.country}-${key}`}
                                    type="button"
                                    className="world-map__row"
                                    onClick={() => (code ? resolveSelection(code) : null)}
                                    disabled={!code}
                                >
                                    <span className="world-map__row-rank">{key + 1}</span>
                                    <div className="world-map__row-body">
                                        <div className="world-map__row-top">
                                            <span className="world-map__row-name">{c.country}</span>
                                            <span className="world-map__row-val">
                                                {demoMode
                                                    ? `${c.num.total > 9999 ? String(c.num.total).slice(0, 2) : String(c.num.total).slice(0, 1)}${c.num.total > 999 ? "k" : "**"}`
                                                    : c.num.total.toLocaleString("de-DE")}
                                            </span>
                                        </div>
                                        <div className="world-map__row-bar">
                                            <div
                                                className="world-map__row-bar-fill"
                                                style={{ width: `${pctBar}%` }}
                                            />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>
            </div>

            <CountryDetailDrawer
                country={selected}
                total={total}
                demoMode={demoMode}
                onClose={closeDrawer}
                renderCountryPanelExtras={renderCountryPanelExtras}
            />
        </>
    );
}
