import { ensureDir, copy, exists } from "https://deno.land/std/fs/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";

async function downloadInstallScript(repoUrl: string): Promise<void> {
  const tempDir = await Deno.makeTempDir();
  
  try {
    console.log("📥 Baixando script de instalação...");
    const cloneProcess = new Deno.Command("git", {
      args: ["clone", "--depth", "1", repoUrl, tempDir],
    });

    const cloneOutput = await cloneProcess.output();
    if (!cloneOutput.success) {
      const decoder = new TextDecoder();
      throw new Error(`Falha ao clonar o repositório:\n${decoder.decode(cloneOutput.stderr)}`);
    }

    const sourceFile = join(tempDir, "install-component.ts");
    const targetFile = "install-component.ts";

    await copy(sourceFile, targetFile, { overwrite: true });
    console.log("✅ Script de instalação baixado com sucesso!");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

// Função para listar os arquivos .tsx do repositório remoto
async function listComponentsRemote(repoUrl: string): Promise<string[]> {
  const tempDir = await Deno.makeTempDir();

  console.log("🔍 Clonando repositório remoto...");
  const cloneProcess = new Deno.Command("git", {
    args: ["clone", "--depth", "1", "--filter=blob:none", "--sparse", repoUrl, tempDir],
  });

  const cloneOutput = await cloneProcess.output();
  if (!cloneOutput.success) {
    const decoder = new TextDecoder();
    throw new Error(`Falha ao clonar o repositório remoto:\n${decoder.decode(cloneOutput.stderr)}`);
  }

  console.log("🔍 Buscando componentes correspondentes...");
  const listProcess = new Deno.Command("git", {
    args: ["ls-tree", "--full-tree", "-r", "HEAD", "components"],
    cwd: tempDir,
  });

  const listOutput = await listProcess.output();
  if (!listOutput.success) {
    const decoder = new TextDecoder();
    throw new Error(`Falha ao listar os componentes:\n${decoder.decode(listOutput.stderr)}`);
  }

  const decoder = new TextDecoder();
  const output = decoder.decode(listOutput.stdout);

  const components = output
    .split("\n")
    .filter(line => line.endsWith(".tsx"))
    .map(line => line.split("\t")[1]);

  await Deno.remove(tempDir, { recursive: true });

  return components;
}

async function installComponent(componentName: string, repoUrl: string) {
  let tempDir: string | undefined;

  try {
    console.log("🔍 Verificando ambiente...");
    const currentDir = Deno.cwd();
    const componentsDir = join(currentDir, "src", "components");
    const componentDir = join(componentsDir, componentName);

    console.log("📁 Verificando estrutura de pastas...");
    await ensureDir(componentDir);

    console.log("📦 Preparando para baixar o componente...");
    tempDir = await Deno.makeTempDir();

    console.log("🔍 Clonando repositório remoto...");
    const cloneProcess = new Deno.Command("git", {
      args: [
        "clone",
        "--depth", "1",
        "--filter=blob:none",
        "--sparse",
        repoUrl,
        tempDir,
      ],
    });

    const cloneOutput = await cloneProcess.output();
    if (!cloneOutput.success) {
      const decoder = new TextDecoder();
      throw new Error(`Falha ao clonar repositório:\n${decoder.decode(cloneOutput.stderr)}`);
    }

    console.log("🔍 Buscando componentes correspondentes...");
    const components = await listComponentsRemote(repoUrl);
    if (components.length === 0) {
      throw new Error("Nenhum componente encontrado no repositório.");
    }

    if (components.length === 1) {
      console.log(`Apenas um componente encontrado: ${components[0]}`);
    } else {
      console.log("Escolha um componente para instalar:");
      components.forEach((component, index) => {
        console.log(`${index + 1}: ${component}`);
      });

      const selectedIndex = parseInt(Deno.args[0] ?? "", 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= components.length) {
        throw new Error("Seleção inválida. Por favor, escolha um número de 1 a " + components.length);
      }

      console.log(`Você escolheu o componente: ${components[selectedIndex]}`);
    }

    const selectedComponent = components.length === 1 ? components[0] : components[parseInt(Deno.args[0] ?? "", 10) - 1];
    const componentDirPath = selectedComponent.replace(".tsx", "");

    console.log("🔍 Localizando componente...");

    // Correção do sparse-checkout para incluir o diretório components
    const sparseProcess = new Deno.Command("git", {
      args: ["-C", tempDir, "sparse-checkout", "set", "components"],
    });

    const sparseOutput = await sparseProcess.output();
    if (!sparseOutput.success) {
      const decoder = new TextDecoder();
      throw new Error(`Erro ao configurar sparse-checkout:\n${decoder.decode(sparseOutput.stderr)}`);
    }

    // Atualizar o repositório após configurar sparse-checkout
    const pullProcess = new Deno.Command("git", {
      args: ["-C", tempDir, "pull", "origin", "main"],
    });
    await pullProcess.output();

    // Corrigir o caminho do arquivo fonte
    const sourceFile = join(tempDir, selectedComponent);
    const targetFile = join(componentDir, componentName);

    console.log("📋 Copiando arquivos...");
    await copy(sourceFile, targetFile, { overwrite: true });

    console.log(`✅ Componente instalado com sucesso em:\n${componentDir}`);

  } catch (error) {
    console.error("\n❌ Erro durante a instalação:");
    console.error("----------------------------");
    console.error(error.message);
    console.error("----------------------------");
    console.error("\n💡 Dicas:");
    console.error("1. Verifique se está no diretório correto do projeto");
    console.error("2. Certifique-se de que tem permissões para criar pastas e arquivos");
    console.error("3. Verifique se tem acesso ao repositório");

    // Lançando erro ao invés de usar Deno.exit
    throw error;
  } finally {
    if (tempDir) {
      console.log("\n🧹 Limpando arquivos temporários...");
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        console.warn("⚠️  Não foi possível limpar alguns arquivos temporários");
      }
    }
  }
}

if (import.meta.main) {
  const componentName = Deno.args[0];

  if (!componentName) {
    console.error("\n❌ Erro: Nome do componente é obrigatório");
    console.error("\n📘 Uso:");
    console.error("deno run --allow-run --allow-read --allow-write --allow-net scripts/install-component.ts <nome-do-componente>");
    console.error("\n📝 Exemplo:");
    console.error("deno run --allow-run --allow-read --allow-write --allow-net scripts/install-component.ts MultiSliderRange");
    throw new Error("Nome do componente é obrigatório.");
  }

  const scriptExists = await exists("install-component.ts");
  const repoUrl = "https://github.com/deco-sites/components.git";

  if (!scriptExists) {
    await downloadInstallScript(repoUrl);
    
    // Reexecutar o scri
