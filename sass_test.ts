import { assertEquals$ } from "./asserts.ts";
import { Content } from "./content.ts";
import {
  CSS_MEDIA_TYPE,
  getSassCompiler,
  Options,
  sass,
  SCSS_MEDIA_TYPE,
} from "./sass.ts";

Deno.test({
  name: "sass()",
  ignore: await getSassCompiler() == null,
  async fn() {
    const compileSass = sass(
      { outputStyle: "compressed", asString: true } as Options,
    );
    const d = new Date();
    const scss = new Content("p{a{color:red}}", SCSS_MEDIA_TYPE, null, d);
    const css = compileSass(scss);
    await assertEquals$(
      css,
      new Content("p a{color:red}\n", CSS_MEDIA_TYPE, null, d),
    );
  },
});
