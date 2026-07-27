import { canAccess, TIER_LABELS, TIER_PRICES } from '../../Functions/tier.js';
import './Style.css';

const Link = window.ReactRouterDOM.Link;

// fullPage: replaces the whole content area with an upgrade prompt
// inline: blurs children and overlays a lock message
export default function TierGate({ minTier, featureName, children, fullPage }) {
    if (canAccess(minTier)) return children ?? null;

    const tierLabel = TIER_LABELS[minTier];
    const tierPrice = TIER_PRICES[minTier];

    const lockIcon = (
        <svg className="tier-gate__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );

    if (fullPage || !children) {
        return (
            <div className="tier-gate tier-gate--page">
                {lockIcon}
                <h2 className="tier-gate__heading">
                    {featureName ? `${featureName} requires ` : 'Requires the '}
                    <span className="tier-gate__tier-name">{tierLabel}</span>
                    {featureName ? ' plan' : ' plan'}
                </h2>
                <p className="tier-gate__sub">
                    Upgrade to {tierLabel} starting at {tierPrice} to unlock this feature.
                </p>
                <Link to="/settings/plans" className="tier-gate__btn">
                    View Plans
                </Link>
            </div>
        );
    }

    return (
        <div className="tier-gate tier-gate--inline">
            <div className="tier-gate__blurred" aria-hidden="true">{children}</div>
            <div className="tier-gate__overlay">
                {lockIcon}
                <p className="tier-gate__heading">
                    {featureName ?? 'This feature'} requires{' '}
                    <span className="tier-gate__tier-name">{tierLabel}</span>
                </p>
                <p className="tier-gate__sub">
                    {tierPrice} — <Link to="/settings/plans" className="tier-gate__link">View Plans</Link>
                </p>
            </div>
        </div>
    );
}
