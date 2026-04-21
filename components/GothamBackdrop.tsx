/** Camadas estáticas: vignette, bruma e silhueta de morcego bem sutil */

export default function GothamBackdrop() {
  return (
    <div className="gotham-backdrop" aria-hidden>
      <div className="gotham-backdrop__haze" />
      <div className="gotham-backdrop__vignette" />
      <div className="gotham-backdrop__bat" />
    </div>
  );
}
