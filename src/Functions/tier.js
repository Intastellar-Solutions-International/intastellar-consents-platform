import appStorage from './storage.js';
export const TIERS = {
    none: 0,
    personal: 1,
    starter: 2,
    growth: 3,
    'agency-pro': 4,
};

export const TIER_LABELS = {
    none: 'No Plan',
    personal: 'Personal',
    starter: 'Starter',
    growth: 'Growth',
    'agency-pro': 'Agency Pro',
};

export const TIER_PRICES = {
    none: null,
    personal: '€5/mo',
    starter: '€15/mo',
    growth: '€30/mo',
    'agency-pro': '€39/mo',
};

export const TIERS_ORDER = ['none', 'personal', 'starter', 'growth', 'agency-pro'];

// Each feature key maps to its minimum required tier
export const FEATURE_TIERS = {
    audit_log:                 'personal',
    csv_export:                'personal',
    dsr_portal:                'personal',
    analytics_dashboard:       'starter',
    reporting:                 'starter',
    cookie_scanner:            'starter',
    jurisdiction_config:       'starter',
    advanced_reporting:        'growth',
    team_insights:             'growth',
    ad_platform_reconciliation:'growth',
    blind_spot_detection:      'growth',
    cost_per_consent:          'growth',
    legal_basis_tracking:      'growth',
    ropa_builder:              'growth',
    multi_client_management:   'agency-pro',
    client_level_reporting:    'agency-pro',
};

function mapSubscriptionToTier(subscription) {
    switch (subscription) {
        case 'personal':    return 'personal';
        case 'starter':     return 'starter';
        case 'growth':      return 'growth';
        case 'agency-pro':
        case 'agency':      return 'agency-pro'; // backward compat with old "agency" value
        default:            return 'none';
    }
}

export function getTier() {
    const devTier = localStorage.getItem('dev_tier');
    if (devTier && TIERS[devTier] !== undefined) return devTier;

    try {
        const org = JSON.parse(appStorage.getItem('organisation') || '{}');
        if (org?.id && String(org.id) === '1') return 'agency-pro';

        const sub = JSON.parse(appStorage.getItem('subscription') || '{}');
        return mapSubscriptionToTier(sub?.tier ?? sub?.subscription);
    } catch {
        return 'none';
    }
}

export function canAccess(minTier) {
    return TIERS[getTier()] >= TIERS[minTier];
}

export function hasFeature(feature) {
    const required = FEATURE_TIERS[feature];
    if (!required) return false;
    return canAccess(required);
}
