if (process.env.NEXT_PUBLIC_DEBUG !== "true") {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}
export {};
