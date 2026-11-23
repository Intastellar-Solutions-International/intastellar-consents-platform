// Per-minute activity as thin bars (react-native-svg).
import { useState } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { colors } from "../lib/theme.js";

export default function Bars({ values, height = 56, color = colors.data }) {
    const [width, setWidth] = useState(0);
    const max = Math.max(...(values || []), 1);
    const gap = 2;
    const w = values?.length ? (width - gap * (values.length - 1)) / values.length : 0;
    return (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`max ${max}`}>
            {width > 0 && (
                <Svg width={width} height={height}>
                    {(values || []).map((v, i) => {
                        const h = v > 0 ? Math.max(2, (v / max) * height) : 1;
                        return <Rect key={i} x={i * (w + gap)} y={height - h} width={Math.max(1, w)} height={h} rx={1} fill={v > 0 ? color : colors.border} />;
                    })}
                </Svg>
            )}
        </View>
    );
}
