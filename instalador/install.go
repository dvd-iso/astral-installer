package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
)

// Progress é o que a tela mostra durante cada etapa.
type Progress struct {
	Step       int
	Bytes      int64
	TotalBytes int64
	Count      int
	TotalCount int
	Detail     string
}

type reporter func(Progress)

type write struct {
	path   string
	source Source
}

type plan struct {
	writes  []write
	deletes []string
	kept    []string
}

// planInstall decide o que muda, com as mesmas regras do atualizador do mod (update/Planner.java):
// só sai o que veio no pack e está intacto, configurações alteradas ficam, e o resto da pasta não é tocado.
func planInstall(gameDir string, previous map[string]string, files map[string]Source) (*plan, error) {
	result := &plan{}
	for _, path := range sortedKeys(files) {
		source := files[path]
		target, err := resolveInside(gameDir, path)
		if err != nil {
			return nil, err
		}
		local, err := hashFile(target)
		if err != nil {
			return nil, err
		}
		if local == source.SHA512 {
			continue
		}
		if local != "" && preserveChanges(path) && local != previous[path] {
			result.kept = append(result.kept, path) // O jogador mudou (ou criou) esta configuração.
			continue
		}
		result.writes = append(result.writes, write{path, source})
	}
	for _, path := range sortedKeys(previous) {
		if _, ok := files[path]; ok {
			continue
		}
		target, err := resolveInside(gameDir, path)
		if err != nil {
			return nil, err
		}
		local, err := hashFile(target)
		if err != nil {
			return nil, err
		}
		if local == "" {
			continue
		}
		if local == previous[path] {
			result.deletes = append(result.deletes, path)
		} else {
			result.kept = append(result.kept, path)
		}
	}
	return result, nil
}

// installPack instala ou atualiza o pack em gameDir. Tudo é baixado e conferido antes de qualquer arquivo do jogo mudar;
// rodar de novo depois de uma falha retoma de onde parou.
func installPack(ctx context.Context, gameDir string, pack *Pack, step int, report reporter) (*plan, error) {
	work, err := planInstall(gameDir, installedFiles(gameDir), pack.Files)
	if err != nil {
		return nil, err
	}
	stage := filepath.Join(gameDir, ".astral", "instalador")
	var downloads []write
	var total int64
	for _, item := range work.writes {
		if item.source.Entry == nil {
			downloads = append(downloads, item)
			total += item.source.Size
		}
	}
	if err := fetchAll(ctx, stage, downloads, total, step, report); err != nil {
		return nil, err
	}

	report(Progress{Step: step + 1, TotalCount: len(work.writes) + len(work.deletes)})
	done := 0
	for _, item := range work.writes {
		target, err := resolveInside(gameDir, item.path)
		if err != nil {
			return nil, err
		}
		if item.source.Entry != nil {
			err = extract(item.source, target)
		} else {
			if err = os.MkdirAll(filepath.Dir(target), 0o755); err == nil {
				err = replaceFile(filepath.Join(stage, item.source.SHA512), target)
			}
		}
		if err != nil {
			return nil, fmt.Errorf("não deu para gravar %s. Feche o Minecraft e tente de novo (%w)", item.path, err)
		}
		done++
		report(Progress{Step: step + 1, Count: done, TotalCount: len(work.writes) + len(work.deletes), Detail: item.path})
	}
	for _, path := range work.deletes {
		target, err := resolveInside(gameDir, path)
		if err != nil {
			return nil, err
		}
		if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("não deu para remover %s. Feche o Minecraft e tente de novo (%w)", path, err)
		}
		done++
		report(Progress{Step: step + 1, Count: done, TotalCount: len(work.writes) + len(work.deletes), Detail: path})
	}
	// Uma atualização que o mod deixou pendente ficou para trás: esta instalação já é a versão atual.
	os.RemoveAll(filepath.Join(gameDir, ".astral", "atualizacao"))
	return work, nil
}

// fetchAll baixa os mods em paralelo para stage/<sha512>. Arquivos já conferidos numa tentativa anterior são reaproveitados.
func fetchAll(ctx context.Context, stage string, items []write, total int64, step int, report reporter) error {
	var bytes atomic.Int64
	var count atomic.Int32
	var mu sync.Mutex
	current := ""
	emit := func() {
		mu.Lock()
		detail := current
		mu.Unlock()
		report(Progress{Step: step, Bytes: bytes.Load(), TotalBytes: total, Count: int(count.Load()), TotalCount: len(items), Detail: detail})
	}
	emit()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan write)
	errs := make(chan error, 1)
	var wg sync.WaitGroup
	for worker := 0; worker < 6; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for item := range jobs {
				dest := filepath.Join(stage, item.source.SHA512)
				if hash, _ := hashFile(dest); hash == item.source.SHA512 {
					bytes.Add(item.source.Size)
				} else {
					mu.Lock()
					current = filepath.Base(item.path)
					mu.Unlock()
					err := download(ctx, item.source.URLs, dest, Expected{item.source.Size, "sha512", item.source.SHA512},
						func(n int64) { bytes.Add(n); emit() })
					if err != nil {
						select {
						case errs <- fmt.Errorf("falhou o download de %s: %w", filepath.Base(item.path), err):
						default:
						}
						cancel()
						return
					}
				}
				count.Add(1)
				emit()
			}
		}()
	}
feed:
	for _, item := range items {
		select {
		case jobs <- item:
		case <-ctx.Done():
			break feed
		}
	}
	close(jobs)
	wg.Wait()
	select {
	case err := <-errs:
		return err
	default:
	}
	return ctx.Err()
}
