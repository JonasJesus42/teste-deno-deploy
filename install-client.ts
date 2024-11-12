import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";

async function installComponent(componentName: string) {
  try {
    console.log("🔍 Verificando ambiente...");
    const currentDir = Deno.cwd();
    const componentsDir = join(currentDir, "src", "components");

    console.log("📁 Verificando estrutura de pastas...");
    await ensureDir(componentsDir);

    console.log("📦 Buscando componente...");
    const response = await fetch(
      `https://seu-deploy-url.deno.dev?component=${encodeURIComponent(componentName)}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao buscar componente");
    }

    const data = await response.json();
    const componentPath = join(componentsDir, `${componentName}.tsx`);

    console.log("📋 Salvando componente...");
    await Deno.writeTextFile(componentPath, data.content);

    console.log(`✅ Componente instalado com sucesso em:\n${componentPath}`);
  } catch (error) {
    console.error("\n❌ Erro durante a instalação:");
    console.error("----------------------------");
    console.error(error.message);
    console.error("----------------------------");
  }
}

if (import.meta.main) {
  const componentName = Deno.args[0];

  if (!componentName) {
    console.error("\n❌ Erro: Nome do componente é obrigatório");
    console.error("\n📘 Uso:");
    console.error("deno run --allow-net --allow-read --allow-write install-client.ts <nome-do-componente>");
    Deno.exit(1);
  }

  await installComponent(componentName);
}
