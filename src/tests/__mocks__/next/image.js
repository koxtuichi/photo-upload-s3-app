// Next/Image コンポーネントのモック
import React from "react";

// 単純な img 要素を返すモック
const Image = ({ src, alt, width, height, className, ...props }) => {
  return (
    <img
      src={src}
      alt={alt}
      width={width || 100}
      height={height || 100}
      className={className}
      {...props}
    />
  );
};

export default Image;
