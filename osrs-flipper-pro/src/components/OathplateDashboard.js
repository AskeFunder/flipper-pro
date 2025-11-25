import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    TimeScale,
    Legend,
    Tooltip,
} from "chart.js";
import 'chartjs-adapter-date-fns';

ChartJS.register(
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    TimeScale,
    Legend,
    Tooltip
);

const API_BASE = "http://localhost:3001";
const itemId = 30765;

const timeOptions = [
    { label: '4H', ms: 4 * 3600e3 },
    { label: '12H', ms: 12 * 3600e3 },
    { label: '1D', ms: 24 * 3600e3 },
    { label: '1W', ms: 7 * 24 * 3600e3 },
    { label: '1M', ms: 30 * 24 * 3600e3 },
    { label: '3M', ms: 90 * 24 * 3600e3 },
    { label: '1Y', ms: 365 * 24 * 3600e3 },
    { label: 'All', ms: 0 },
];

const timestepMap = {
    '4H': '4h',
    '12H': '5m',
    '1D': '5m',
    '1W': '1h',
    '1M': '6h',
    '3M': '24h',
    '1Y': '24h',
    'All': '24h',
};

export default function OathplateDashboard() {
    const [priceData, setPriceData] = useState([]);
    const [latest, setLatest] = useState(null);
    const [recentTrades, setRecentTrades] = useState([]);
    const [shaleHigh, setShaleHigh] = useState(null);
    const [timeRange, setTimeRange] = useState('12H');
    const [parts, setParts] = useState({
        chest: { price: null, time: null },
        helm: { price: null, time: null },
        legs: { price: null, time: null },
    });

    const componentIds = {
        shale: 30848,
        chest: 30753,
        helm: 30750,
        legs: 30756,
    };

    const calculateProfit = (sellPrice: number | null) => {
        if (!latest?.low || !shaleHigh || !sellPrice) return null;
        const cost = 450 * latest.low + 2520 * shaleHigh;
        const netSell = sellPrice * 0.98;
        return Math.round(netSell - cost);
    };

    const minutesAgo = (ts: number | null) =>
        ts ? Math.floor((Date.now() - ts * 1000) / 60000) : null;

    useEffect(() => {
        const granularity = timestepMap[timeRange];

        const fetchChart = () => {
            fetch(`${API_BASE}/api/prices/chart/${granularity}/${itemId}`)
                .then(res => res.json())
                .then(setPriceData)
                .catch(console.error);
        };

        fetchChart();
        const int = setInterval(fetchChart, 15000);
        return () => clearInterval(int);
    }, [timeRange]);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const main = await fetch(`${API_BASE}/api/prices/latest/${itemId}`).then(res => res.json());
                setLatest(main);

                const ids = [
                    componentIds.shale,
                    componentIds.chest,
                    componentIds.helm,
                    componentIds.legs
                ];
                const results = await Promise.all(
                    ids.map(id => fetch(`${API_BASE}/api/prices/latest/${id}`).then(res => res.json()))
                );

                setShaleHigh(results[0]?.high ?? null);
                setParts({
                    chest: { price: results[1]?.high, time: results[1]?.ts },
                    helm: { price: results[2]?.high, time: results[2]?.ts },
                    legs: { price: results[3]?.high, time: results[3]?.ts },
                });
            } catch (err) {
                console.error("Latest fetch error:", err);
            }
        };

        fetchAll();
        const int = setInterval(fetchAll, 15000);
        return () => clearInterval(int);
    }, []);

    useEffect(() => {
        const fetchRecent = () => {
            fetch(`${API_BASE}/api/prices/recent/${itemId}`)
                .then(res => res.json())
                .then(setRecentTrades)
                .catch(console.error);
        };

        fetchRecent();
        const int = setInterval(fetchRecent, 15000);
        return () => clearInterval(int);
    }, []);

    const now = Date.now();
    const selected = timeOptions.find(o => o.label === timeRange);
    const minTime = selected ? now - selected.ms : 0;
    const filtered = priceData.filter(p => minTime === 0 || p.ts * 1000 >= minTime);

    // Calculate min/max for x-axis - NO PADDING, exact bounds
    const xMin = filtered.length > 0 ? new Date(Math.min(...filtered.map(p => p.ts * 1000))) : null;
    const xMax = filtered.length > 0 ? new Date(Math.max(...filtered.map(p => p.ts * 1000))) : null;

    // Calculate min/max for y-axis with padding
    const allPrices = filtered.flatMap(p => [p.high, p.low]).filter(v => v != null && v > 0);
    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
    const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
    
    // Detect spikes/crashes: if max is more than 3x the average, it's likely a spike
    const hasSpike = maxPrice > avgPrice * 3 && avgPrice > 0;
    
    const priceRange = maxPrice - minPrice;
    const paddingAmount = priceRange > 0 ? priceRange * 0.2 : maxPrice * 0.1; // 20% padding, or 10% of max if range is 0
    
    const yMin = Math.max(0, minPrice - paddingAmount);
    const yMax = hasSpike ? maxPrice : maxPrice + paddingAmount; // Only bottom padding if spike

    const chartData = {
        labels: filtered.map(p => new Date(p.ts * 1000)),
        datasets: [
            {
                label: "Sell",
                data: filtered.map(p => p.high),
                borderColor: "red",
                tension: 0.1,
                pointRadius: 0,
                spanGaps: true,
            },
            {
                label: "Buy",
                data: filtered.map(p => p.low),
                borderColor: "green",
                tension: 0.1,
                pointRadius: 0,
                spanGaps: true,
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            tooltip: {
                callbacks: {
                    title: items => new Date(items[0].parsed.x).toLocaleString()
                }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                title: { display: true, text: 'Time' },
                offset: false,
                bounds: 'ticks',
                min: xMin,
                max: xMax,
                grace: 0,
                ticks: {
                    padding: 0
                }
            },
            y: { 
                title: { display: true, text: 'Price (gp)' },
                min: yMin,
                max: yMax
            }
        }
    };

    return (
        <div style={{ width: '60%', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <h2>Oathplate Shard</h2>

            <p>
                {latest
                    ? <>Buy: {latest.low?.toLocaleString()} gp | Sell: {latest.high?.toLocaleString()} gp</>
                    : "Loading prices..."}
            </p>

            {shaleHigh && <p>Shale – High: {shaleHigh.toLocaleString()} gp</p>}

            {['chest', 'helm', 'legs'].map(part => {
                const data = parts[part];
                const profit = calculateProfit(data.price);
                return data.price ? (
                    <p key={part}>
                        Oathplate {part[0].toUpperCase() + part.slice(1)} – High: {data.price.toLocaleString()} gp ({minutesAgo(data.time)} mins ago) — Profit:{" "}
                        <span style={{ color: profit != null && profit >= 0 ? "green" : "red" }}>
                            {profit != null ? profit.toLocaleString() + " gp" : "N/A"}
                        </span>
                    </p>
                ) : null;
            })}

            <div style={{ marginBottom: 12 }}>
                {timeOptions.map(({ label }) => (
                    <button
                        key={label}
                        onClick={() => setTimeRange(label)}
                        style={{
                            marginRight: 6,
                            padding: '6px 10px',
                            background: label === timeRange ? '#1e1e1e' : '#f0f0f0',
                            color: label === timeRange ? '#fff' : '#000',
                            borderRadius: 4,
                            border: label === timeRange ? '2px solid #444' : '1px solid #ccc',
                            cursor: 'pointer'
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <p>No price data available in selected range.</p>
            ) : (
                <div style={{ height: '60vh' }}>
                    <Line data={chartData} options={chartOptions} />
                </div>
            )}

            <h3>Recent Trades</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th align="left">Time</th>
                        <th align="left">Type</th>
                        <th align="left">Price</th>
                    </tr>
                </thead>
                <tbody>
                    {recentTrades.map((t, i) => {
                        const isBuy = t.type === 'buy';
                        const label = isBuy ? 'BUY' : 'SELL';
                        const rowColor = isBuy ? '#eaffea' : '#ffeaea';
                        const textColor = isBuy ? '#007a00' : '#b20000';
                        return (
                            <tr key={i} style={{ backgroundColor: rowColor, color: textColor }}>
                                <td>{new Date(t.ts * 1000).toLocaleTimeString()}</td>
                                <td>{label}</td>
                                <td>{t.price.toLocaleString()} gp</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
