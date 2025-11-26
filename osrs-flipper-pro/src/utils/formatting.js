import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

export function formatCompact(n) {
    if (n == null) return "-";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
}

export function formatPriceFull(n) {
    if (n == null) return "-";
    const num = typeof n === "string" ? parseFloat(n) : n;
    if (isNaN(num)) return "-";
    return num.toLocaleString("en-US") + " gp";
}

export function formatPriceSmart(n) {
    if (n == null) return "-";
    const num = typeof n === "string" ? parseFloat(n) : n;
    if (isNaN(num)) return "-";
    
    const abs = Math.abs(num);
    
    if (abs < 10_000_000) {
        // < 10M: full number with commas
        return num.toLocaleString("en-US") + " gp";
    } else if (abs < 100_000_000) {
        // 10M - 99M: show in K with 1 decimal
        return (num / 1_000).toFixed(1) + "K gp";
    } else if (abs < 1_000_000_000) {
        // 100M - 999M: show in M with 1 decimal
        return (num / 1_000_000).toFixed(1) + "M gp";
    } else {
        // >= 1B: show in M with no decimal
        return Math.round(num / 1_000_000) + "M gp";
    }
}

export function formatColoredNumber(n) {
    if (n > 0) return <span style={{ color: "#16a34a", fontFamily: "monospace" }}>{formatCompact(n)}</span>;
    if (n < 0) return <span style={{ color: "#dc2626", fontFamily: "monospace" }}>-{formatCompact(Math.abs(n))}</span>;
    return <span style={{ fontFamily: "monospace" }}>0</span>;
}

export function formatRoi(n) {
    const val = typeof n === "string" ? parseFloat(n) : n;
    if (val == null || Math.abs(val) < 0.001 || isNaN(val)) return "-";
    const color = val > 0 ? "#16a34a" : "#dc2626";
    return <span style={{ color, fontFamily: "monospace" }}>{val.toFixed(2)}%</span>;
}

export function timeAgo(unix) {
    if (!unix) return "-";
    const now = Math.floor(Date.now() / 1000);
    const diffSeconds = now - unix;
    
    if (diffSeconds < 60) {
        return `${diffSeconds}s ago`;
    }
    
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }
    
    const diffHours = Math.floor(diffSeconds / 3600);
    const remainingMinutes = Math.floor((diffSeconds % 3600) / 60);
    
    if (diffHours < 24) {
        if (remainingMinutes === 0) {
            return `${diffHours}h ago`;
        }
        return `${diffHours}h ${remainingMinutes}m ago`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    const finalRemainingMinutes = Math.floor((diffSeconds % 86400) % 3600 / 60);
    
    if (remainingHours === 0 && finalRemainingMinutes === 0) {
        return `${diffDays}d ago`;
    }
    
    // For days, show days and hours, skip minutes to keep it shorter
    if (remainingHours === 0) {
        return `${diffDays}d ago`;
    }
    return `${diffDays}d ${remainingHours}h ago`;
}

/**
 * Format timestamp with fuzzy human-readable labels
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} - Human-readable label with timestamp (only for >24hrs)
 */
export function formatFuzzyTime(timestamp) {
    if (!timestamp) return "-";
    
    const date = dayjs(timestamp * 1000);
    const now = dayjs();
    const diffHours = now.diff(date, 'hour');
    
    // For trades less than 24 hours ago, don't show the full timestamp
    if (diffHours < 24) {
        const diffMinutes = now.diff(date, 'minute');
        
        if (diffMinutes < 1) {
            const diffSeconds = now.diff(date, 'second');
            return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`;
        } else if (diffMinutes < 60) {
            return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
        } else {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        }
    }
    
    // For trades 24+ hours ago, include the full timestamp
    const fullTime = date.format('MMM D, YYYY h:mm:ss A');
    
    if (date.isYesterday()) {
        return `Yesterday (${fullTime})`;
    }
    
    const diffDays = now.diff(date, 'day');
    const diffWeeks = now.diff(date, 'week');
    
    if (diffDays < 7) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago (${fullTime})`;
    } else if (diffWeeks < 4) {
        return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago (${fullTime})`;
    } else {
        // For older dates, show the date
        return date.format('MMM D, YYYY h:mm:ss A');
    }
}

export function parseHumanNumber(input) {
    if (!input) return null;
    const str = input.toLowerCase().replace(/,/g, '').trim();
    if (str.endsWith("k")) return parseFloat(str) * 1_000;
    if (str.endsWith("m")) return parseFloat(str) * 1_000_000;
    if (str.endsWith("b")) return parseFloat(str) * 1_000_000_000;
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
}

// Convert item name to URL-friendly slug
export function nameToSlug(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-')      // Replace spaces with hyphens
        .replace(/-+/g, '-')        // Replace multiple hyphens with single
        .replace(/^-|-$/g, '');    // Remove leading/trailing hyphens
}

// Convert URL slug back to item name (approximate - for display purposes)
export function slugToName(slug) {
    if (!slug) return '';
    return decodeURIComponent(slug)
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}