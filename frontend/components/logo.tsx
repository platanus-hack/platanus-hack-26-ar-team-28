export const Logo = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 140 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Shield icon */}
      <path
        d="M16 2L4 7V14.5C4 21.5 9.1 28.05 16 30C22.9 28.05 28 21.5 28 14.5V7L16 2Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M12 16L15 19L21 13"
        stroke="#FFC700"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Text: VIBEFENCE */}
      <text
        x="36"
        y="21"
        fill="currentColor"
        fontFamily="monospace"
        fontSize="14"
        fontWeight="600"
        letterSpacing="0.5"
      >
        VIBEFENCE
      </text>
    </svg>
  );
};
