import React, { useMemo } from 'react';
import { useProTimelineEngine } from '../../../hooks/useProTimelineEngine';
import dayjs from 'dayjs';
import { useTheme } from '../../../themes/useCoreTheme';

const HEADER_HEIGHT = 52;

export default function ProTimelineAxis() {
    const { panX, panY, pixelsPerDay, xToDate, dateToX } = useProTimelineEngine();
    const [theme] = useTheme();
    
    // Virtualize rendering window
    const windowStartPx = -panX - 800;
    const windowEndPx = -panX + 3500; 

    const isDark = theme?.mode === 'dark';
    const axisBg = isDark ? 'linear-gradient(180deg, #1f1f1f 0%, #141414 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f8f9fb 100%)';
    const borderColor = isDark ? '#303030' : '#e0e0e0';
    const dividerColor = isDark ? '#262626' : '#eee';
    const primaryText = isDark ? 'rgba(255,255,255,0.85)' : '#262626';
    const secondaryText = isDark ? 'rgba(255,255,255,0.45)' : '#8c8c8c';
    const weekendText = isDark ? 'rgba(255,255,255,0.25)' : '#bfbfbf';
    const shadowColor = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)';
    const subtleBorder = isDark ? '#434343' : '#d9d9d9';
    const superSubtleBorder = isDark ? '#262626' : '#f0f0f0';
    const todayBaseColor = theme?.palette?.error?.main || '#ff4d4f';
    const weekendBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';

    const { days, months } = useMemo(() => {
        const dArr: { x: number; w: number; label: string; isWeekend: boolean; isToday: boolean; isMonthStart: boolean; key: string }[] = [];
        const mArr: { x: number; w: number; label: string; key: string }[] = [];

        const startD = dayjs(xToDate(windowStartPx));
        const endD = dayjs(xToDate(windowEndPx));
        const today = dayjs().format('YYYY-MM-DD');
        
        // Months
        let cursorM = startD.startOf('month');
        while (cursorM.isBefore(endD) || cursorM.isSame(endD, 'month')) {
            const nextM = cursorM.add(1, 'month');
            const x1 = dateToX(cursorM.format('YYYY-MM-DD'));
            const x2 = dateToX(nextM.format('YYYY-MM-DD'));
            mArr.push({
                x: x1, w: x2 - x1,
                label: cursorM.format('YYYY年 M月'),
                key: cursorM.format('YYYY-MM')
            });
            cursorM = nextM;
        }

        // Days (switch to weeks if too dense)
        const showWeeks = pixelsPerDay < 10;
        let cursorD = showWeeks ? startD.day(0) : startD.startOf('day');
        while (cursorD.isBefore(endD) || cursorD.isSame(endD, 'day')) {
            const nextD = showWeeks ? cursorD.add(7, 'day') : cursorD.add(1, 'day');
            const x1 = dateToX(cursorD.format('YYYY-MM-DD'));
            const x2 = dateToX(nextD.format('YYYY-MM-DD'));
            const dow = cursorD.day();
            const isWeekend = dow === 0 || dow === 6;
            const isToday = cursorD.format('YYYY-MM-DD') === today;
            const isMonthStart = cursorD.date() === 1;
            
            dArr.push({
                x: x1, w: x2 - x1,
                label: showWeeks ? cursorD.format('M/D') : cursorD.format('DD'),
                isWeekend, isToday, isMonthStart,
                key: cursorD.format('YYYY-MM-DD')
            });
            cursorD = nextD;
        }

        return { days: dArr, months: mArr };
    }, [windowStartPx, windowEndPx, pixelsPerDay, xToDate, dateToX]);

    return (
        <div style={{
            position: 'absolute',
            left: 0, 
            top: -panY,
            right: 0,
            height: HEADER_HEIGHT,
            background: axisBg,
            borderBottom: `2px solid ${borderColor}`,
            boxShadow: `0 2px 8px ${shadowColor}`,
            zIndex: 10,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}>
            {/* Top: Months */}
            <div style={{ height: 28, position: 'relative', borderBottom: `1px solid ${dividerColor}` }}>
                {months.map(m => (
                    <div key={m.key} style={{
                        position: 'absolute', left: m.x, width: m.w, height: 28,
                        borderLeft: `1px solid ${subtleBorder}`,
                        paddingLeft: 12, display: 'flex', alignItems: 'center',
                        fontSize: 13, fontWeight: 700, color: primaryText,
                        letterSpacing: '0.5px',
                    }}>
                        {m.label}
                    </div>
                ))}
            </div>

            {/* Bottom: Days */}
            <div style={{ height: 24, position: 'relative' }}>
                {days.map(d => (
                    <div key={d.key} style={{
                        position: 'absolute', left: d.x, width: d.w, height: 24,
                        borderLeft: d.isMonthStart ? `1px solid ${subtleBorder}` : `1px solid ${superSubtleBorder}`,
                        backgroundColor: d.isToday
                            ? `${todayBaseColor}1A`
                            : d.isWeekend
                                ? weekendBg
                                : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: d.isToday ? 700 : 400,
                        color: d.isToday ? todayBaseColor : d.isWeekend ? weekendText : secondaryText,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {d.label}
                    </div>
                ))}
            </div>
        </div>
    );
}
