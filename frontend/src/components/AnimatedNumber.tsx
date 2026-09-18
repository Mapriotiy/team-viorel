import { useCountUp } from "../hooks/useCountUp";

type AnimatedNumberProps = {
    value: number;
    className?: string;
};

export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
    const animated = useCountUp(value);
    return <span className={className}>{animated}</span>;
}
