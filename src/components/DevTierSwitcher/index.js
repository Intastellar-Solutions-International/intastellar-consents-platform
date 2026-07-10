import { TIERS_ORDER, TIER_LABELS, TIER_PRICES, getTier } from '../../Functions/tier.js';
import './Style.css';
import appStorage from '../../Functions/storage.js';

const { useState } = React;

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function getRealTier() {
    try {
        const org = JSON.parse(appStorage.getItem('organisation') || '{}');
        if (org?.id && String(org.id) === '1') return 'agency-pro';
        const sub = JSON.parse(appStorage.getItem('subscription') || '{}');
        const s = sub?.subscription;
        if (s === 'agency' || s === 'agency-pro') return 'agency-pro';
        if (s === 'growth') return 'growth';
        if (s === 'starter') return 'starter';
        if (s === 'personal') return 'personal';
    } catch { /* ignore */ }
    return 'none';
}

export default function DevTierSwitcher() {
    if (!IS_DEV) return null;

    const [open, setOpen] = useState(false);
    const currentTier = getTier();
    const isDevOverride = localStorage.getItem('dev_tier') !== null;

    const handleSelect = (tier) => {
        if (tier === '__real__') {
            localStorage.removeItem('dev_tier');
        } else {
            localStorage.setItem('dev_tier', tier);
        }
        window.location.reload();
    };

    return (
        <div className={`dev-tier${open ? ' dev-tier--open' : ''}`}>
            <button
                className="dev-tier__toggle"
                onClick={() => setOpen(o => !o)}
                title="Dev: simulate subscription tier"
                aria-expanded={open}
            >
                <span className="dev-tier__badge">DEV</span>
                <span className={`dev-tier__current${isDevOverride ? ' dev-tier__current--override' : ''}`}>
                    {TIER_LABELS[currentTier]}
                </span>
            </button>

            {open && (
                <div className="dev-tier__panel" role="dialog" aria-label="Tier simulator">
                    <p className="dev-tier__heading">Simulate Tier</p>
                    <div className="dev-tier__options">
                        {TIERS_ORDER.filter(t => t !== 'none').map(tier => (
                            <button
                                key={tier}
                                className={`dev-tier__option${isDevOverride && currentTier === tier ? ' dev-tier__option--active' : ''}`}
                                onClick={() => handleSelect(tier)}
                            >
                                <span>{TIER_LABELS[tier]}</span>
                                <span className="dev-tier__price">{TIER_PRICES[tier]}</span>
                            </button>
                        ))}
                        {isDevOverride && (
                            <button
                                className="dev-tier__option dev-tier__option--reset"
                                onClick={() => handleSelect('__real__')}
                            >
                                <span>↩ Use real subscription</span>
                                <span className="dev-tier__price">{TIER_LABELS[getRealTier()]}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
