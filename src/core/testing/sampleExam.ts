import type { Exam } from '../domain';

export const sampleExam: Exam = {
  id: 'sample-marketing',
  title: 'Sample DECA Exam (Demo Data)',
  questions: [
    {
      id: 'sample-q1',
      number: 1,
      prompt:
        'Which element of the marketing mix is concerned with getting products from the producer to the consumer?',
      choices: [
        { id: 'a', label: 'A', text: 'Product' },
        { id: 'b', label: 'B', text: 'Price' },
        { id: 'c', label: 'C', text: 'Place' },
        { id: 'd', label: 'D', text: 'Promotion' },
      ],
      correctChoiceId: 'c',
      explanation:
        'Place, also called distribution, covers the channels and methods used to move products from the producer to the final consumer. Product, price, and promotion are the other three elements of the marketing mix.',
    },
    {
      id: 'sample-q2',
      number: 2,
      prompt:
        'A business has current assets of $300,000 and current liabilities of $200,000. What is its current ratio?',
      choices: [
        { id: 'a', label: 'A', text: '0.67' },
        { id: 'b', label: 'B', text: '1.5' },
        { id: 'c', label: 'C', text: '2.0' },
        { id: 'd', label: 'D', text: '3.0' },
      ],
      correctChoiceId: 'b',
      explanation:
        'The current ratio is current assets divided by current liabilities: $300,000 divided by $200,000 equals 1.5.',
    },
    {
      id: 'sample-q3',
      number: 3,
      prompt: 'What is the primary purpose of a business plan?',
      choices: [
        { id: 'a', label: 'A', text: 'To satisfy a one-time legal filing requirement' },
        { id: 'b', label: 'B', text: 'To guarantee that a new venture will be profitable' },
        { id: 'c', label: 'C', text: 'To communicate goals and strategies to lenders, investors, and employees' },
        { id: 'd', label: 'D', text: 'To replace the need for ongoing financial record keeping' },
      ],
      correctChoiceId: 'c',
      explanation:
        'A business plan states the venture\u2019s goals, market analysis, operating strategy, and financial projections so that lenders, investors, and employees can understand and support the direction of the business.',
    },
    {
      id: 'sample-q4',
      number: 4,
      prompt:
        'A company has fixed costs of $10,000, a selling price of $50 per unit, and variable costs of $30 per unit. How many units must it sell to break even?',
      choices: [
        { id: 'a', label: 'A', text: '200 units' },
        { id: 'b', label: 'B', text: '333 units' },
        { id: 'c', label: 'C', text: '500 units' },
        { id: 'd', label: 'D', text: '800 units' },
      ],
      correctChoiceId: 'c',
      explanation:
        'Break-even units equal fixed costs divided by the difference between selling price and variable cost: $10,000 divided by ($50 minus $30) equals 500 units.',
    },
    {
      id: 'sample-q5',
      number: 5,
      prompt:
        'Why do organizations provide confidential feedback channels such as ethics hotlines?',
      choices: [
        { id: 'a', label: 'A', text: 'To allow employees to report concerns without fear of retaliation' },
        { id: 'b', label: 'B', text: 'To reduce the number of human resources staff members' },
        { id: 'c', label: 'C', text: 'To create a record that can be used in advertising' },
        { id: 'd', label: 'D', text: 'To avoid the need for a written code of ethics' },
      ],
      correctChoiceId: 'a',
      explanation:
        'Confidential channels let employees raise ethical, safety, or compliance concerns anonymously or privately, which encourages reporting and protects reporters from retaliation.',
    },
  ],
};
