import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedExam } from '../../../../core/pdf/types';
import type { PageRenderer } from '../../pdf/pageRenderer';
import { createMemoryRepository } from '../../storage/memoryRepository';
import type { Repository } from '../../storage/contract';
import { parsedExam, parsedQuestion } from './fixtures';
import { ImportScreen } from './ImportScreen';
import type { ImportServices } from './services';

const pdfFile = () => new File([new Uint8Array([37, 80, 68, 70])], 'exam.pdf', { type: 'application/pdf' });

function fakeRenderer(): PageRenderer & { render: ReturnType<typeof vi.fn> } {
  return {
    pageCount: 33,
    render: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    destroy: vi.fn(async () => undefined),
  };
}

interface Harness {
  repo: Repository;
  navigate: ReturnType<typeof vi.fn>;
  services: ImportServices & { parse: ReturnType<typeof vi.fn>; renderSnapshot: ReturnType<typeof vi.fn> };
  renderer: ReturnType<typeof fakeRenderer>;
  user: ReturnType<typeof userEvent.setup>;
}

function setup(parsed: ParsedExam, options: { hash?: string; repo?: Repository } = {}): Harness {
  const repo = options.repo ?? createMemoryRepository();
  const navigate = vi.fn();
  const renderer = fakeRenderer();
  const services = {
    pickPdf: null,
    hash: vi.fn(async () => options.hash ?? 'hash-1'),
    parse: vi.fn(async () => parsed),
    renderSnapshot: vi.fn(async () => new Blob(['snap'], { type: 'image/png' })),
    createPageRenderer: vi.fn(async () => renderer),
  } as unknown as Harness['services'];
  const user = userEvent.setup();
  render(<ImportScreen repo={repo} navigate={navigate} services={services} />);
  return { repo, navigate, services, renderer, user };
}

async function chooseFile(h: Harness): Promise<void> {
  await h.user.upload(screen.getByTestId('pdf-input'), pdfFile());
}

const goToReview = async (h: Harness) => {
  await chooseFile(h);
  await h.user.click(await screen.findByRole('button', { name: 'Review questions' }));
};

const goToConfirm = async (h: Harness) => {
  await goToReview(h);
  await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe('ImportScreen', () => {
  it('walks choose -> check -> review -> save and writes the exam', async () => {
    const h = setup(parsedExam([parsedQuestion(1), parsedQuestion(2), parsedQuestion(3)]));
    await chooseFile(h);

    expect(await screen.findByRole('heading', { name: 'We read your exam' })).toBeInTheDocument();
    expect(screen.getByText('Questions found').previousSibling).toHaveTextContent('3');

    await h.user.click(screen.getByRole('button', { name: 'Review questions' }));
    expect(screen.getByRole('heading', { name: 'Check your questions' })).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
    await h.user.click(screen.getByRole('button', { name: 'Save exam' }));

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ name: 'library' }));
    const [exam] = await h.repo.listExams();
    expect(exam).toMatchObject({ title: 'HOSPITALITY AND TOURISM CLUSTER EXAM', testCode: '1206', fileHash: 'hash-1', fileName: 'exam.pdf', questionCount: 3 });
    expect(await h.repo.getQuestions(exam.id)).toHaveLength(3);
  });

  it('saves nothing until the user confirms', async () => {
    const h = setup(parsedExam([parsedQuestion(1)]));
    await goToConfirm(h);
    expect(await h.repo.listExams()).toHaveLength(0);
  });

  it('says so plainly when the exam was already imported, and does not parse again', async () => {
    const repo = createMemoryRepository();
    await repo.saveExam({ title: 'Old exam', fileHash: 'same', fileName: 'old.pdf' }, []);
    const h = setup(parsedExam([parsedQuestion(1)]), { hash: 'same', repo });
    await chooseFile(h);

    expect(await screen.findByRole('heading', { name: 'You already imported this exam' })).toBeInTheDocument();
    expect(screen.getByText(/Old exam/)).toBeInTheDocument();
    expect(h.services.parse).not.toHaveBeenCalled();
    await h.user.click(screen.getByRole('button', { name: 'Open my library' }));
    expect(h.navigate).toHaveBeenCalledWith({ name: 'library' });
  });

  it('blocks review and saving when the report has errors, but allows another file', async () => {
    const h = setup(
      parsedExam([parsedQuestion(1)], [{ severity: 'error', message: 'Found 100 questions but 99 answer-key entries.' }]),
    );
    await chooseFile(h);
    expect(await screen.findByRole('heading', { name: 'We could not read this exam' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Found 100 questions but 99 answer-key entries.');
    expect(screen.queryByRole('button', { name: 'Review questions' })).not.toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: 'Try another file' }));
    expect(screen.getByRole('heading', { name: 'Choose your DECA exam PDF' })).toBeInTheDocument();
    expect(await h.repo.listExams()).toHaveLength(0);
  });

  it('shows warnings in amber on the report and lists the flagged question first in review', async () => {
    const h = setup(
      parsedExam(
        [parsedQuestion(1), parsedQuestion(2), parsedQuestion(47)],
        [{ severity: 'warning', question: 47, message: 'Explanation does not start with the text of option D; check the key.' }],
      ),
    );
    await chooseFile(h);
    expect(await screen.findByText('1 thing to double-check')).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: 'Review questions' }));

    const list = screen.getByRole('navigation', { name: 'Questions' });
    const first = within(list).getAllByRole('button').filter((b) => b.textContent?.startsWith('Q'))[0];
    expect(first).toHaveTextContent('Q47');
    expect(first).toHaveTextContent('Check');
    // The flagged question is open and explains why.
    expect(screen.getByRole('form', { name: 'Question 47' })).toBeInTheDocument();
    expect(screen.getByText(/does not start with the text of option D/)).toBeInTheDocument();
  });

  it('draws the original page for the open question', async () => {
    const h = setup(parsedExam([parsedQuestion(1, { sourcePage: 5 })]));
    await goToReview(h);
    await waitFor(() => expect(h.renderer.render).toHaveBeenCalledWith(5));
    expect(await screen.findByAltText('Page 5 of the PDF')).toBeInTheDocument();
  });

  it('requires ticking the checkbox when flagged questions are still unreviewed', async () => {
    const h = setup(parsedExam([parsedQuestion(1), parsedQuestion(2)], [{ severity: 'warning', question: 2, message: 'Check the key.' }]));
    await goToConfirm(h);
    const save = screen.getByRole('button', { name: 'Save exam' });
    expect(save).toBeDisabled();
    await h.user.click(screen.getByLabelText('I have checked the flagged questions.'));
    expect(save).toBeEnabled();
    await h.user.click(save);
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
  });

  it('needs no checkbox once the flagged question has been edited', async () => {
    const h = setup(parsedExam([parsedQuestion(1)], [{ severity: 'warning', question: 1, message: 'Check the key.' }]));
    await goToReview(h);
    const prompt = screen.getByLabelText('Question');
    await h.user.type(prompt, '!');
    expect(screen.getByRole('tab', { name: /To check \(0\)/ })).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
    expect(screen.queryByLabelText('I have checked the flagged questions.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save exam' })).toBeEnabled();
  });

  it('"It matches the PDF" clears the flag without an edit', async () => {
    const h = setup(parsedExam([parsedQuestion(1)], [{ severity: 'warning', question: 1, message: 'Check the key.' }]));
    await goToReview(h);
    await h.user.click(screen.getByRole('button', { name: 'It matches the PDF' }));
    expect(screen.getByRole('tab', { name: /To check \(0\)/ })).toBeInTheDocument();
    expect(screen.getByText('Checked.')).toBeInTheDocument();
  });

  it('saves the edited text, answer and exclusion', async () => {
    const h = setup(parsedExam([parsedQuestion(1), parsedQuestion(2)]));
    await goToReview(h);
    const form = screen.getByRole('form', { name: 'Question 1' });
    await h.user.clear(within(form).getByLabelText('Option A text'));
    await h.user.type(within(form).getByLabelText('Option A text'), 'Edited A');
    await h.user.click(within(form).getByLabelText('Option C is the correct answer'));
    await h.user.click(within(form).getByLabelText('Exclude this question'));
    await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
    expect(screen.getByText('Questions excluded').nextSibling).toHaveTextContent('1');
    await h.user.click(screen.getByRole('button', { name: 'Save exam' }));

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    const [exam] = await h.repo.listExams();
    expect(exam.questionCount).toBe(1);
    const rows = await h.repo.getQuestions(exam.id);
    expect(rows[0]).toMatchObject({ excluded: true, correctIndex: 2 });
    expect(rows[0].options[0]).toBe('Edited A');
    expect(rows[1].excluded).toBe(false);
  });

  it('cannot save when every question is excluded', async () => {
    const h = setup(parsedExam([parsedQuestion(1)]));
    await goToReview(h);
    await h.user.click(screen.getByLabelText('Exclude this question'));
    await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Every question is excluded');
    expect(screen.getByRole('button', { name: 'Save exam' })).toBeDisabled();
    expect(await h.repo.listExams()).toHaveLength(0);
  });

  it('blocks saving a question whose text was emptied until it is fixed or excluded', async () => {
    const h = setup(parsedExam([parsedQuestion(1), parsedQuestion(2)]));
    await goToReview(h);
    await h.user.clear(screen.getByLabelText('Question'));
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('The question text is empty.');
    await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
    expect(screen.getByRole('button', { name: 'Save exam' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('1 question has empty text');
  });

  it('takes a screenshot for questions with pictures and stores it on the row', async () => {
    const visual = { kinds: ['image' as const], segments: [{ page: 2, top: 700, bottom: 560 }] };
    const h = setup(parsedExam([parsedQuestion(1), parsedQuestion(2, { visual })]));
    await chooseFile(h);
    await screen.findByRole('heading', { name: 'We read your exam' });
    expect(h.services.renderSnapshot).toHaveBeenCalledTimes(1);
    expect(h.services.renderSnapshot.mock.calls[0][1]).toEqual(visual.segments);

    await h.user.click(screen.getByRole('button', { name: 'Review questions' }));
    await h.user.click(screen.getByRole('button', { name: /^Q2/ }));
    expect(await screen.findByAltText('Question 2 as printed in the PDF')).toBeInTheDocument();
    await h.user.click(screen.getByRole('button', { name: 'Continue to save' }));
    await h.user.click(screen.getByRole('button', { name: 'Save exam' }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    const [exam] = await h.repo.listExams();
    const rows = await h.repo.getQuestions(exam.id);
    expect(rows[0].snapshot).toBeUndefined();
    expect(rows[1].snapshot).toBeInstanceOf(Blob);
  });

  it('flags a picture question whose screenshot failed', async () => {
    const visual = { kinds: ['graphic' as const], segments: [{ page: 2, top: 700, bottom: 560 }] };
    const h = setup(parsedExam([parsedQuestion(1, { visual })]));
    h.services.renderSnapshot.mockRejectedValueOnce(new Error('canvas broke'));
    await goToReview(h);
    expect(screen.getByText(/screenshot of this question could not be made/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /To check \(1\)/ })).toBeInTheDocument();
  });

  it('rejects a file that is not a PDF without parsing it', async () => {
    const h = setup(parsedExam([parsedQuestion(1)]));
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByTestId('pdf-input'), new File(['hi'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a PDF');
    expect(h.services.parse).not.toHaveBeenCalled();
  });

  it('shows a plain-language error when the PDF cannot be read at all', async () => {
    const h = setup(parsedExam([parsedQuestion(1)]));
    h.services.parse.mockRejectedValueOnce(new Error('Invalid PDF structure.'));
    await chooseFile(h);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not read that file. Invalid PDF structure.');
    expect(screen.getByRole('heading', { name: 'Choose your DECA exam PDF' })).toBeInTheDocument();
  });

  it('uses the native picker when the Electron bridge is present', async () => {
    const repo = createMemoryRepository();
    const pickPdf = vi.fn(async () => ({ name: 'native.pdf', data: new Uint8Array([1]) }));
    const services = {
      pickPdf,
      hash: async () => 'h',
      parse: async () => parsedExam([parsedQuestion(1)]),
      renderSnapshot: async () => new Blob(),
      createPageRenderer: async () => fakeRenderer(),
    } satisfies ImportServices;
    const user = userEvent.setup();
    render(<ImportScreen repo={repo} navigate={vi.fn()} services={services} />);
    await user.click(screen.getByRole('button', { name: 'Choose PDF…' }));
    expect(pickPdf).toHaveBeenCalled();
    expect(await screen.findByText(/native\.pdf/)).toBeInTheDocument();
  });

  it('Cancel returns to the library', async () => {
    const h = setup(parsedExam([parsedQuestion(1)]));
    await h.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.navigate).toHaveBeenCalledWith({ name: 'library' });
  });
});
