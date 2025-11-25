import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export default function Tooltip({ text, children }) {
    const [show, setShow] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const tooltipRef = useRef(null);

    useEffect(() => {
        if (show && triggerRef.current && tooltipRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();
            
            // Position above the trigger, centered
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 8;
            
            // Ensure tooltip doesn't go off the left edge
            if (left < 10) {
                left = 10;
            }
            
            // Ensure tooltip doesn't go off the right edge
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }
            
            setPosition({ top, left });
        }
    }, [show]);

    return (
        <>
            <div
                ref={triggerRef}
                style={{ position: "relative", display: "inline-block" }}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            >
                {children}
            </div>
            {show && createPortal(
                <div
                    ref={tooltipRef}
                    style={{
                        position: "fixed",
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        padding: "10px 14px",
                        backgroundColor: "#1f2937",
                        color: "#fff",
                        borderRadius: 6,
                        fontSize: 12,
                        lineHeight: "1.5",
                        zIndex: 9999,
                        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                        pointerEvents: "none",
                        maxWidth: "500px",
                        minWidth: "300px",
                        whiteSpace: "normal",
                        textAlign: "left",
                    }}
                >
                    {text}
                    <div
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            border: "6px solid transparent",
                            borderTopColor: "#1f2937",
                        }}
                    />
                </div>,
                document.body
            )}
        </>
    );
}

